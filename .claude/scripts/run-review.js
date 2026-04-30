#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawnSync, spawn } = require('child_process');

var costTracker = require('./lib/cost-tracker');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLAUDE_DIR = path.join(REPO_ROOT, '.claude');
const SCRIPTS_DIR = __dirname;
const PROFILES_DIR = path.join(CLAUDE_DIR, 'review-profiles');
const THRESHOLDS = { readyToMerge: 60, maxUrgency: 50 };

// Reviewers get full tool access so they can investigate the codebase.
// Do NOT add --disable-slash-commands or --system-prompt here.
const CLAUDE_ARGS = ['-p', '--dangerously-skip-permissions', '--no-session-persistence'];

const BACKENDS = {
  'claude-haiku':  { cmd: 'claude', args: [...CLAUDE_ARGS, '--model', 'haiku'],  provider: 'Claude', model: 'Haiku 4.5',  cost: '$',    speed: 'fast' },
  'claude-sonnet': { cmd: 'claude', args: [...CLAUDE_ARGS, '--model', 'sonnet'], provider: 'Claude', model: 'Sonnet 4.6', cost: '$$',   speed: 'medium' },
  'claude-opus':   { cmd: 'claude', args: [...CLAUDE_ARGS, '--model', 'opus'],   provider: 'Claude', model: 'Opus 4.6',   cost: '$$$$', speed: 'slow' },
  'codex':         { cmd: 'codex',  args: ['exec', '--full-auto', '--color', 'never'],   provider: 'Codex',  model: 'default', cost: '$$',  speed: 'medium' },
  'codex-mini':    { cmd: 'codex',  args: ['exec', '--full-auto', '--color', 'never', '-m', 'o4-mini'], provider: 'Codex', model: 'o4-mini', cost: '$', speed: 'fast' },
  'gemini-pro':    { cmd: 'gemini-wrapper', geminiModel: 'gemini-2.5-pro',  provider: 'Gemini', model: '2.5 Pro',  cost: '$$',  speed: 'medium' },
  'gemini-flash':  { cmd: 'gemini-wrapper', geminiModel: 'gemini-2.5-flash', provider: 'Gemini', model: '2.5 Flash', cost: '$', speed: 'fast' },
};

function log(stage, msg) { console.log('[' + new Date().toLocaleTimeString() + '] [' + stage + '] ' + msg); }
function git(args) { return execSync('git ' + args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30000 }).trim(); }
function generateSessionName() { return 'review-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6); }

function checkBackendAvailable(key) {
  var b = BACKENDS[key]; if (!b) return false;
  var cmd = b.cmd === 'gemini-wrapper' ? 'gemini' : b.cmd;
  return spawnSync('which', [cmd], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).status === 0;
}
function getAvailableBackends() {
  return Object.entries(BACKENDS).filter(function(e) { return checkBackendAvailable(e[0]); }).map(function(e) { return Object.assign({ key: e[0] }, e[1]); });
}

function createRL() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
function ask(rl, q) { return new Promise(function(resolve) { rl.question(q, resolve); }); }

function printModelTable(available) {
  console.log('  #   Provider   Model            Cost   Speed');
  console.log('  --- ---------- ---------------- ------ ------');
  for (var i = 0; i < available.length; i++) {
    var b = available[i];
    console.log('  ' + String(i + 1).padStart(2) + '  ' + (b.provider || '').padEnd(10) + ' ' + (b.model || '').padEnd(16) + ' ' + (b.cost || '').padEnd(6) + ' ' + (b.speed || ''));
  }
}

function resolveModel(input, available) {
  var num = parseInt(input, 10);
  if (num >= 1 && num <= available.length) return available[num - 1].key;
  var match = available.find(function(a) { return a.key === input; });
  return match ? match.key : null;
}

async function interactiveConfig(rl) {
  var available = getAvailableBackends();
  console.log('\n=== CODE REVIEW PIPELINE - CONFIGURATION ===\n');
  printModelTable(available);

  console.log('\n-- STEP 1/4: REVIEWERS --');
  console.log('  These models independently review your code in parallel.');
  console.log('  Each is a fresh process with zero shared context.');
  console.log('  Format: <number> x <count>  (e.g. "2 x 3" = 3 instances of model #2)');
  console.log('  Add one per line. Press enter when done.');
  console.log('  Default (just press enter): 3x Claude Sonnet\n');
  var reviewers = [];
  while (true) {
    var ri = await ask(rl, '  > ');
    if (!ri.trim()) break;
    var rp = ri.trim().split(/\s*[x*]\s*/i);
    var rm = resolveModel(rp[0], available);
    var rc = rp.length > 1 ? (parseInt(rp[1], 10) || 1) : 1;
    if (!rm) { console.log('    Invalid. Pick 1-' + available.length + '.'); continue; }
    var rb = available.find(function(a) { return a.key === rm; });
    reviewers.push({ model: rm, count: rc });
    console.log('    + ' + rc + 'x ' + rb.provider + ' ' + rb.model);
  }
  if (reviewers.length === 0) reviewers = [{ model: 'claude-sonnet', count: 3 }];

  console.log('\n-- STEP 2/4: AGGREGATOR --');
  console.log('  Combines all reviewer outputs into one unified review.');
  var ai = await ask(rl, '  Pick a number [default: claude-sonnet]: ');
  var aggregator = ai.trim() ? (resolveModel(ai.trim(), available) || 'claude-sonnet') : 'claude-sonnet';
  var ab = available.find(function(a) { return a.key === aggregator; });
  if (ab) console.log('  Selected: ' + ab.provider + ' ' + ab.model);

  console.log('\n-- STEP 3/4: VALIDATORS --');
  console.log('  Check each reviewer comment for accuracy.');
  console.log('  Format: <number> x <count>. Press enter when done.');
  console.log('  Default: 2x Claude Haiku\n');
  var validators = [];
  while (true) {
    var vi = await ask(rl, '  > ');
    if (!vi.trim()) break;
    var vp = vi.trim().split(/\s*[x*]\s*/i);
    var vm = resolveModel(vp[0], available);
    var vc = vp.length > 1 ? (parseInt(vp[1], 10) || 1) : 1;
    if (!vm) { console.log('    Invalid. Pick 1-' + available.length + '.'); continue; }
    var vb = available.find(function(a) { return a.key === vm; });
    validators.push({ model: vm, count: vc });
    console.log('    + ' + vc + 'x ' + vb.provider + ' ' + vb.model);
  }
  if (validators.length === 0) validators = [{ model: 'claude-haiku', count: 2 }];

  console.log('\n-- STEP 4/4: FINAL DECISION --');
  console.log('  Produces the merge verdict. Consider a stronger model.');
  var fi = await ask(rl, '  Pick a number [default: claude-sonnet]: ');
  var finalModel = fi.trim() ? (resolveModel(fi.trim(), available) || 'claude-sonnet') : 'claude-sonnet';
  var fb = available.find(function(a) { return a.key === finalModel; });
  if (fb) console.log('  Selected: ' + fb.provider + ' ' + fb.model);

  var tgt = await ask(rl, '\n  What to review? (e.g. main...HEAD, branch name, or enter for uncommitted changes): ');
  var target = tgt.trim() || null;
  var mc = await ask(rl, '  Max review-fix cycles (0 = unlimited) [3]: ');
  var maxCycles = parseInt(mc || '3', 10);
  var ti = await ask(rl, '  Reviewer timeout in minutes [10]: ');
  var timeoutMinutes = parseInt(ti || '10', 10);
  var config = { reviewers: reviewers, aggregator: aggregator, validators: validators, finalModel: finalModel, timeoutMinutes: timeoutMinutes, maxCycles: maxCycles, target: target };

  var totalR = reviewers.reduce(function(s, r) { return s + r.count; }, 0);
  var totalV = validators.reduce(function(s, v) { return s + v.count; }, 0);
  console.log('\n-- SUMMARY --');
  console.log('  Reviewers:  ' + reviewers.map(function(r) { return r.count + 'x ' + r.model; }).join(', ') + ' (' + totalR + ' total)');
  console.log('  Aggregator: ' + aggregator);
  console.log('  Validators: ' + validators.map(function(v) { return v.count + 'x ' + v.model; }).join(', ') + ' (' + totalV + ' total)');
  console.log('  Final:      ' + finalModel);
  console.log('  Timeout:    ' + timeoutMinutes + 'm');
  console.log('  Max cycles: ' + (maxCycles === 0 ? 'unlimited' : maxCycles));
  if (target) console.log('  Target:     ' + target);

  var confirm = await ask(rl, '\nProceed? [Y/n]: ');
  if (confirm.toLowerCase() === 'n') { console.log('Aborted.'); process.exit(0); }
  var sp = await ask(rl, 'Save as profile? (name or enter to skip): ');
  if (sp.trim()) { saveProfileToDisk(sp.trim(), config); log('config', 'Profile saved: ' + sp.trim()); }
  return config;
}

function loadProfile(name) { var fp = path.join(PROFILES_DIR, name + '.json'); if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8')); return null; }
function saveProfileToDisk(name, config) { fs.mkdirSync(PROFILES_DIR, { recursive: true }); fs.writeFileSync(path.join(PROFILES_DIR, name + '.json'), JSON.stringify(config, null, 2), 'utf8'); }
function listProfiles() { var p = {}; if (fs.existsSync(PROFILES_DIR)) { for (var f of fs.readdirSync(PROFILES_DIR)) { if (f.endsWith('.json')) p[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8')); } } return p; }

function getDiff(target) {
  if (target) { try { return git("diff " + target); } catch (_) {} }
  var d = ''; try { d = git('diff --cached'); } catch (_) {} if (!d) { try { d = git('diff'); } catch (_) {} } if (!d) { try { d = git('diff main...HEAD'); } catch (_) {} } if (!d) { try { d = git('diff HEAD~1'); } catch (_) {} }
  return d || 'No changes detected.';
}


function resolveReviewCwd(config) {
  var target = (config && config.target) || '';
  var branch = target.split('...').pop() || '';
  if (!branch) return REPO_ROOT;
  try {
    var output = git('worktree list --porcelain');
    var lines = output.split('\n');
    var currentPath = null;
    // First pass: match by branch name
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) currentPath = lines[i].slice(9);
      if (lines[i].startsWith('branch ') && lines[i].includes(branch)) return currentPath;
    }
    // Second pass: match by worktree directory name
    currentPath = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        currentPath = lines[i].slice(9);
        if (currentPath.includes(branch) || currentPath.includes(branch.replace('worktree-', ''))) return currentPath;
      }
    }
  } catch (_) {}
  return REPO_ROOT;
}

function getBranchName(cwd) {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: cwd, encoding: 'utf8' }).trim(); } catch (_) { return 'unknown'; }
}

function findWorktreeForBranch(branchName) {
  try {
    var output = git('worktree list --porcelain');
    var lines = output.split('\n');
    var currentPath = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) currentPath = lines[i].slice(9);
      if (lines[i].startsWith('branch ') && lines[i].includes(branchName)) return currentPath;
    }
    // Fallback: match by directory name
    currentPath = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        currentPath = lines[i].slice(9);
        if (currentPath.includes(branchName) || currentPath.includes(branchName.replace('worktree-', ''))) return currentPath;
      }
    }
  } catch (_) {}
  return null;
}

function extractJson(text) { try { return JSON.parse(text); } catch (_) {} var m = text.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} } return null; }

// Run a single agent as a child process. Returns a promise.
function runAgentAsync(backendKey, prompt, outputFile, options) {
  options = options || {};
  var stage = options.stage || 'review';
  var startMs = Date.now();
  var backend = BACKENDS[backendKey];
  if (!backend) return Promise.reject(new Error('Unknown backend: ' + backendKey));

  return new Promise(function(resolve, reject) {
    var cmd, args;
    if (backend.cmd === 'claude') {
      cmd = 'claude';
      args = backend.args.slice(); // no budget cap — reviewers spawn subagents that need room
    } else if (backend.cmd === 'codex') {
      cmd = 'codex';
      args = (backend.args || ['exec', '--full-auto', '--color', 'never']).concat(['-']);
    } else if (backend.cmd === 'gemini-wrapper') {
      cmd = path.join(process.env.HOME || '', '.claude', 'bin', 'codeagent-wrapper');
      args = ['--backend', 'gemini'];
      if (backend.geminiModel) args.push('--gemini-model', backend.geminiModel);
      args.push('-', REPO_ROOT);
    } else {
      return reject(new Error('Unsupported: ' + backend.cmd));
    }

    var out = fs.openSync(outputFile, 'w');
    var err = fs.openSync(outputFile + '.err', 'w');
    var stdinData = (backend.cmd === 'gemini-wrapper' || backend.cmd === 'claude' || backend.cmd === 'codex') ? prompt : undefined;

    var agentCwd = options.cwd || REPO_ROOT;
    var child = spawn(cmd, args, {
      cwd: agentCwd,
      stdio: [stdinData ? 'pipe' : 'ignore', out, err],
      env: process.env
    });

    if (stdinData && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }

    var timer = setTimeout(function() {
      child.kill('SIGTERM');
      costTracker.recordInvocation(backendKey, stage, prompt, '', Date.now() - startMs, false);
      reject(new Error(backendKey + ' timed out'));
    }, 20 * 60 * 1000);

    child.on('close', function(code) {
      clearTimeout(timer);
      fs.closeSync(out);
      fs.closeSync(err);
      if (code === 0) {
        resolve(fs.readFileSync(outputFile, 'utf8').trim());
      } else {
        var errText = '';
        try { errText = fs.readFileSync(outputFile + '.err', 'utf8').trim(); } catch (_) {}
        costTracker.recordInvocation(backendKey, stage, prompt, errText, Date.now() - startMs, false);
          reject(new Error(backendKey + ' exit ' + code + ': ' + errText.slice(0, 200)));
      }
    });

    child.on('error', function(e) {
      clearTimeout(timer);
      costTracker.recordInvocation(backendKey, stage, prompt, '', Date.now() - startMs, false);
      reject(new Error(backendKey + ' spawn error: ' + e.message));
    });
  });
}

// Run agent synchronously (for aggregator/validators/final which are sequential)
function runAgent(backendKey, prompt, stage) {
  stage = stage || 'unknown';
  var startMs = Date.now();
  var backend = BACKENDS[backendKey];
  if (!backend) throw new Error('Unknown backend: ' + backendKey);
  var result;
  if (backend.cmd === 'claude') {
    result = spawnSync('claude', backend.args.slice(), { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000, stdio: ['pipe', 'pipe', 'pipe'], input: prompt });
  } else if (backend.cmd === 'codex') {
    result = spawnSync('codex', (backend.args || ['exec', '--full-auto', '--color', 'never']).concat(['-']), { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10 * 60 * 1000, stdio: ['pipe', 'pipe', 'pipe'], input: prompt });
  } else if (backend.cmd === 'gemini-wrapper') {
    var wp = path.join(process.env.HOME || '', '.claude', 'bin', 'codeagent-wrapper');
    var wa = ['--backend', 'gemini']; if (backend.geminiModel) wa.push('--gemini-model', backend.geminiModel); wa.push('-', REPO_ROOT);
    result = spawnSync(wp, wa, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10 * 60 * 1000, input: prompt, stdio: ['pipe', 'pipe', 'pipe'] });
  } else { throw new Error('Unsupported: ' + backend.cmd); }
  var output = (result.stdout || '').trim();
  var success = !result.error && result.status === 0;
  costTracker.recordInvocation(backendKey, stage, prompt, output, Date.now() - startMs, success);
  if (result.error) throw new Error(backendKey + ' failed: ' + result.error.message);
  if (result.status !== 0) throw new Error(backendKey + ' exit ' + result.status + ': ' + (result.stderr || '').slice(0, 200));
  return output;
}

// ── Stages ──


function findWorktreeForBranch(branchName) {
  try {
    var output = git('worktree list --porcelain');
    var lines = output.split('\n');
    var currentPath = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) currentPath = lines[i].slice(9);
      if (lines[i].startsWith('branch ') && lines[i].includes(branchName)) return currentPath;
    }
    // Fallback: match by directory name
    currentPath = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        currentPath = lines[i].slice(9);
        if (currentPath.includes(branchName) || currentPath.includes(branchName.replace('worktree-', ''))) return currentPath;
      }
    }
  } catch (_) {}
  return null;
}

async function stageReview(sessionName, diff, config) {
  log('review', '-- REVIEW STAGE --');
  var diffTarget = config.target || 'HEAD~1';
  var reviewCwd = resolveReviewCwd(config);
  var reviewBranch = getBranchName(reviewCwd);

  log('review', 'Target: ' + diffTarget);
  log('review', 'Working directory: ' + reviewCwd);
  log('review', 'Branch: ' + reviewBranch);

  // Load reviewer prompt template
  var reviewerTemplate = fs.readFileSync(path.join(CLAUDE_DIR, 'prompts', 'review-coordinator.md'), 'utf8');

  var workers = [];
  for (var spec of config.reviewers) {
    for (var i = 0; i < spec.count; i++) {
      var name = 'reviewer-' + spec.model.replace('claude-', '') + '-' + (i + 1);
      var prompt = reviewerTemplate.replace(/\{\{name\}\}/g, name).replace(/\{\{diffTarget\}\}/g, diffTarget);
      workers.push({ name: name, model: spec.model, prompt: prompt });
    }
  }

  var outDir = path.join(REPO_ROOT, '.orchestration', sessionName);
  fs.mkdirSync(outDir, { recursive: true });

  log('review', 'Launching ' + workers.length + ' reviewer(s) in parallel...');
  log('review', 'Each reviewer spawns subagents: review-typescript, review-security, review-code');

  var promises = workers.map(function(w) {
    var outFile = path.join(outDir, w.name + '.txt');
    log('review', '  Starting ' + w.name + ' (' + w.model + ') in ' + reviewCwd);
    return runAgentAsync(w.model, w.prompt, outFile, { cwd: reviewCwd })
      .then(function(output) {
        log('review', '  Done: ' + w.name);
        return { name: w.name, output: output, ok: true };
      })
      .catch(function(err) {
        log('review', '  Failed: ' + w.name + ' - ' + err.message);
        return { name: w.name, output: '', ok: false, error: err.message };
      });
  });

  var results = await Promise.all(promises);
  var outputs = {};
  var ok = 0;
  for (var r of results) {
    if (r.ok && r.output) { outputs[r.name] = r.output; ok++; }
  }

  if (ok < 1) {
    throw new Error('Only ' + ok + '/' + workers.length + ' reviewers completed.');
  }
  log('review', ok + '/' + workers.length + ' reviewers produced output');
  return { outDir: outDir, outputs: outputs };
}

function stageAggregate(outDir, reviewerOutputs, config) {
  log('aggregate', '-- AGGREGATE STAGE --');
  var text = Object.entries(reviewerOutputs).map(function(e) { return '### ' + e[0] + '\n' + e[1]; }).join('\n\n');
  var aggregatorPrompt = fs.readFileSync(path.join(CLAUDE_DIR, 'prompts', 'review-aggregator.md'), 'utf8').replace('{{reviewerOutputs}}', text);
  log('aggregate', 'Running aggregator (' + config.aggregator + ')...');
  var raw = runAgent(config.aggregator, aggregatorPrompt, 'aggregate');
  var parsed = extractJson(raw);
  if (!parsed) { fs.writeFileSync(path.join(outDir, 'aggregate-raw.txt'), raw, 'utf8'); throw new Error('Aggregator did not produce valid JSON'); }
  fs.writeFileSync(path.join(outDir, 'aggregate.json'), JSON.stringify(parsed, null, 2), 'utf8');
  log('aggregate', 'Score=' + parsed.combined_mergeable_score + ', blocking=' + parsed.blocking_issues);
  return parsed;
}

function stageValidate(outDir, aggregate, config) {
  log('validate', '-- VALIDATE STAGE --');
  var agentDef = fs.readFileSync(path.join(CLAUDE_DIR, 'agents', 'review-validator.md'), 'utf8');
  var aggJson = JSON.stringify(aggregate, null, 2); var validatorOutputs = {}; var idx = 0;
  for (var spec of config.validators) { for (var i = 0; i < spec.count; i++) { var name = 'validator-' + String.fromCharCode(97 + idx); log('validate', 'Running ' + name + ' (' + spec.model + ')...'); try { var raw = runAgent(spec.model, agentDef + '\n\n## Aggregated Review\n\n```json\n' + aggJson + '\n```\n\nYou are ' + name + '. Produce valid JSON only.', 'validate'); var parsed = extractJson(raw); if (parsed) { parsed.validator = name; validatorOutputs[name] = parsed; fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(parsed, null, 2), 'utf8'); log('validate', name + ': merge=' + parsed.ready_to_merge_score + ', urgency=' + parsed.urgency_score); } } catch (err) { log('validate', name + ' failed: ' + err.message); } idx++; } }
  if (Object.keys(validatorOutputs).length === 0) throw new Error('No validators produced output');
  return validatorOutputs;
}

function stageFinal(outDir, aggregate, validatorOutputs, config) {
  log('final', '-- FINAL DECISION --');
  var prompt = 'You are the final decision maker in a multi-agent code review pipeline.\n\n## Rules\n- Average the validator ready_to_merge_scores for final_ready_to_merge_score\n- Average the validator urgency_scores for final_urgency_score\n- If ANY validator found a comment that is important_before_merge AND correct, it must be addressed\n- recommendation: "ready_for_human_review_and_merge", "needs_changes_before_merge", or "requires_another_review_implementation_cycle"\n\n## Aggregated Review\n```json\n' + JSON.stringify(aggregate, null, 2) + '\n```\n\n## Validator Results\n```json\n' + JSON.stringify(validatorOutputs, null, 2) + '\n```\n\nProduce ONLY valid JSON:\n{ "final_ready_to_merge_score": <n>, "final_urgency_score": <n>, "recommendation": "<s>", "validated_comments": [...], "rationale": "<s>" }';
  log('final', 'Running final decision (' + config.finalModel + ')...');
  var raw = runAgent(config.finalModel, prompt, 'final'); var parsed = extractJson(raw);
  if (!parsed) { fs.writeFileSync(path.join(outDir, 'final-raw.txt'), raw, 'utf8'); throw new Error('Final decision did not produce valid JSON'); }
  fs.writeFileSync(path.join(outDir, 'final.json'), JSON.stringify(parsed, null, 2), 'utf8');
  log('final', 'Score=' + parsed.final_ready_to_merge_score + ', urgency=' + parsed.final_urgency_score + ', rec=' + parsed.recommendation);
  return parsed;
}

function stageDecide(finalResult) {
  var passed = finalResult.final_ready_to_merge_score >= THRESHOLDS.readyToMerge && finalResult.final_urgency_score <= THRESHOLDS.maxUrgency;
  log('decide', passed ? 'PASS - Score: ' + finalResult.final_ready_to_merge_score + '>=' + THRESHOLDS.readyToMerge + ', Urgency: ' + finalResult.final_urgency_score + '<=' + THRESHOLDS.maxUrgency : 'NEEDS WORK - Score: ' + finalResult.final_ready_to_merge_score + ', Urgency: ' + finalResult.final_urgency_score);
  log('decide', 'Recommendation: ' + finalResult.recommendation);
  log('decide', 'Rationale: ' + finalResult.rationale);
  if (!passed && finalResult.validated_comments && finalResult.validated_comments.length) { for (var c of finalResult.validated_comments) log('decide', '  - [' + ((c.importance || '?').toUpperCase()) + '] ' + (c.title || c.description || '(untitled)')); }
  return { passed: passed, final: finalResult };
}

function cleanupSession(sessionName) {
  log('cleanup', 'Cleaning up: ' + sessionName);
  var outDir = path.join(REPO_ROOT, '.orchestration', sessionName);
  if (fs.existsSync(outDir)) { log('cleanup', 'Output dir preserved: ' + outDir); }
  log('cleanup', 'Done');
}

function parseCliArgs() {
  var args = process.argv.slice(2); var p = { profile: null, sessionName: null, cleanup: null, timeout: null, maxCycles: null, target: null, help: false, listProfiles: false };
  for (var i = 0; i < args.length; i++) { if (args[i] === '-h' || args[i] === '--help') p.help = true; else if (args[i] === '--profile' && args[i + 1]) p.profile = args[++i]; else if (args[i] === '--session-name' && args[i + 1]) p.sessionName = args[++i]; else if (args[i] === '--cleanup' && args[i + 1]) p.cleanup = args[++i]; else if (args[i] === '--timeout' && args[i + 1]) p.timeout = parseInt(args[++i], 10); else if (args[i] === '--max-cycles' && args[i + 1]) p.maxCycles = parseInt(args[++i], 10); else if (args[i] === '--target' && args[i + 1]) p.target = args[++i]; else if (args[i] === '--list-profiles') p.listProfiles = true; }
  return p;
}

async function main() {
  var args = parseCliArgs();
  if (args.help) {
    process.stdout.write("Usage: node .claude/scripts/run-review.js [options]\n");
    process.stdout.write("\nOptions:\n");
    process.stdout.write("  --profile <name>        Use a profile\n");
    process.stdout.write("  --session-name <name>   Custom session name\n");
    process.stdout.write("  --timeout <minutes>     Override reviewer timeout\n");
    process.stdout.write("  --max-cycles <n>        Max review-fix cycles (0=unlimited, default:3)\n");
    process.stdout.write("  --target <ref>          Branch or commit to review (e.g. main...HEAD, or a branch name)\n");
    process.stdout.write("  --cleanup <session>     Show session output dir\n");
    process.stdout.write("  --list-profiles         Show profiles\n");
    process.stdout.write("  -h, --help              Show this help\n");
    process.exit(0);
  }
  if (args.listProfiles) { var profiles = listProfiles(); console.log('\nAvailable profiles:\n'); for (var e of Object.entries(profiles)) { var rC = e[1].reviewers.reduce(function(s, r) { return s + r.count; }, 0); var vC = e[1].validators.reduce(function(s, v) { return s + v.count; }, 0); console.log('  ' + e[0].padEnd(12) + ' ' + rC + ' reviewers, ' + vC + ' validators, final: ' + e[1].finalModel); } console.log(''); process.exit(0); }
  if (args.cleanup) { cleanupSession(args.cleanup); process.exit(0); }

  var config;
  if (args.profile) { config = loadProfile(args.profile); if (!config) { console.error('Profile not found: ' + args.profile); process.exit(1); } log('config', 'Using profile: ' + args.profile); }
  else { var rl = createRL(); config = await interactiveConfig(rl); rl.close(); }
  if (args.timeout) config.timeoutMinutes = args.timeout;
  if (args.maxCycles !== null) config.maxCycles = args.maxCycles;

  var sessionName = args.sessionName || generateSessionName();
  var startTime = Date.now();
  log('main', '=== CODE REVIEW PIPELINE ===');
  log('main', 'Session: ' + sessionName);

  var MAX_CYCLES = config.maxCycles || 3;

  try {
    for (var cycle = 1; MAX_CYCLES === 0 || cycle <= MAX_CYCLES; cycle++) {
      log('main', '\n--- REVIEW CYCLE ' + cycle + '/' + MAX_CYCLES + ' ---');

      var diff = getDiff(args.target || config.target);
      if (diff === 'No changes detected.') { log('main', 'No changes.'); process.exit(0); }
      log('main', 'Diff: ' + diff.split('\n').length + ' lines');

      var cycleName = sessionName + '-c' + cycle;
      var review = await stageReview(cycleName, diff, config);
      var aggregate = stageAggregate(review.outDir, review.outputs, config);
      var validatorOutputs = stageValidate(review.outDir, aggregate, config);
      var finalResult = stageFinal(review.outDir, aggregate, validatorOutputs, config);
      var decision = stageDecide(finalResult);

      if (decision.passed) {
        // Apply unanimous fixes even on PASS
        var unanimousFixes = (finalResult.validated_comments || []).filter(function(c) {
          return c.important_before_merge && c.correct;
        });
        if (unanimousFixes.length > 0) {
          log('main', unanimousFixes.length + ' unanimous fix(es) to apply before finalizing...');
          var fixIssues = unanimousFixes.map(function(c) {
            return '- ' + (c.title || '') + ': ' + (c.description || c.rationale || '');
          }).join('\n');
          var fixPrompt = 'Apply these fixes. They are confirmed correct by all reviewers.\n\nFixes:\n' + fixIssues + '\n\nOnly modify files that need fixing. Do not add comments.';
          var fixCwd = REPO_ROOT;
          var targetRef = (typeof args !== 'undefined' && args.target) || (config && config.target) || '';
          var targetBranch = targetRef.split('...').pop() || '';
          if (targetBranch) { var wtPath = findWorktreeForBranch(targetBranch); if (wtPath) fixCwd = wtPath; }
          try {
            var fixFile = path.join(require('os').tmpdir(), 'review-unanimous-' + Date.now() + '.txt');
            fs.writeFileSync(fixFile, fixPrompt, 'utf8');
            var fixResult = spawnSync('bash', ['-c', 'claude -p --dangerously-skip-permissions --model sonnet --no-session-persistence "$(cat ' + fixFile + ')"'], {
              cwd: fixCwd, encoding: 'utf8', timeout: 10 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe']
            });
            try { fs.unlinkSync(fixFile); } catch (_) {}
            if (fixResult.status === 0) {
              log('main', 'Unanimous fixes applied.');
              if (fixCwd !== REPO_ROOT) {
                try { execSync('git add -A && git commit -m "fix: apply unanimous review feedback"', { cwd: fixCwd, encoding: 'utf8' }); log('main', 'Committed fixes.'); } catch (_) { log('main', 'No changes to commit.'); }
              }
            }
          } catch (e) { log('main', 'Could not apply unanimous fixes: ' + e.message); }
        }

        // Write review comments to markdown for human reference
        var allComments = finalResult.validated_comments || [];
        if (allComments.length > 0) {
          var md = '# Review Comments\n\n';
          md += 'PR passed automated review. These comments are for human reference.\n\n';
          md += '## Score: ' + finalResult.final_ready_to_merge_score + '/100\n\n';
          md += '## Recommendation: ' + finalResult.recommendation + '\n\n';
          md += '## Rationale\n\n' + (finalResult.rationale || '') + '\n\n';
          md += '## Comments\n\n';
          for (var c of allComments) {
            var sev = (c.importance || 'info').toUpperCase();
            md += '### [' + sev + '] ' + (c.title || '(untitled)') + '\n\n';
            if (c.description) md += c.description + '\n\n';
            if (c.file) md += '**File**: `' + c.file + '`' + (c.line ? ':' + c.line : '') + '\n\n';
            if (c.suggestion) md += '**Suggestion**: ' + c.suggestion + '\n\n';
            md += '---\n\n';
          }
          var commentFile = path.join(review.outDir, 'review-comments.md');
          fs.writeFileSync(commentFile, md, 'utf8');
          log('main', 'Review comments saved: ' + commentFile);
        }

        // Commit and push
        var pushCwd = REPO_ROOT;
        var targetRef2 = (typeof args !== 'undefined' && args.target) || (config && config.target) || '';
        var targetBranch2 = targetRef2.split('...').pop() || '';
        if (targetBranch2) { var wtPath2 = findWorktreeForBranch(targetBranch2); if (wtPath2) pushCwd = wtPath2; }
        try {
          var branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: pushCwd, encoding: 'utf8' }).trim();
          execSync('git push -u origin ' + branchName, { cwd: pushCwd, encoding: 'utf8', timeout: 30000 });
          log('main', 'Pushed to origin/' + branchName);
        } catch (e) { log('main', 'Push failed: ' + e.message.slice(0, 100)); }

        var elapsed = Math.round((Date.now() - startTime) / 1000);
        log('main', '\n=== PASSED after ' + cycle + ' cycle(s) (' + elapsed + 's) ===');
        log('main', 'Results: .orchestration/' + cycleName + '/final.json');
        costTracker.printSummary();
        process.exit(0);
      }

      if (MAX_CYCLES > 0 && cycle === MAX_CYCLES) {
        var elapsed = Math.round((Date.now() - startTime) / 1000);
        log('main', '\n=== STILL NEEDS WORK after ' + MAX_CYCLES + ' cycles (' + elapsed + 's) ===');
        log('main', 'Remaining issues:');
        if (finalResult.validated_comments) {
          for (var c of finalResult.validated_comments) log('main', '  - ' + (c.title || c.description || '(untitled)'));
        }
        log('main', 'Results: .orchestration/' + cycleName + '/final.json');
        log('main', 'Fix remaining issues manually and re-run.');
        costTracker.printSummary();
        process.exit(1);
      }

      // Fix cycle
      log('fix', '-- FIX CYCLE ' + cycle + ' --');
      var issues = (finalResult.validated_comments || []).map(function(c) {
        return '- ' + (c.title || '') + ': ' + (c.description || c.rationale || '');
      }).join('\n');
      var fixPrompt = 'The following issues were found in a code review of this project. Fix each one.\n\nIssues:\n' + issues + '\n\nFix each issue. Only modify files that have actual problems. Do not add comments explaining the fix.';

      var fixCwd = REPO_ROOT;
      var targetRef = (typeof args !== 'undefined' && args.target) || (config && config.target) || '';
      var targetBranch = targetRef.split('...').pop() || '';
      if (targetBranch) {
        var wtPath = findWorktreeForBranch(targetBranch);
        if (wtPath) { fixCwd = wtPath; }
      }
      var fixBranch = getBranchName(fixCwd);
      log('fix', 'Branch: ' + fixBranch);
      log('fix', 'Working directory: ' + fixCwd);
      log('fix', 'Asking claude to fix ' + (finalResult.validated_comments || []).length + ' issues...');
      try {
        var fixPromptFile = path.join(require('os').tmpdir(), 'review-fix-' + Date.now() + '.txt');
        fs.writeFileSync(fixPromptFile, fixPrompt, 'utf8');
        var fixResult = spawnSync('bash', ['-c', 'claude -p --dangerously-skip-permissions --model sonnet --no-session-persistence "$(cat ' + fixPromptFile + ')"'], {
          cwd: fixCwd, encoding: 'utf8', timeout: 10 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe']
        });
        try { fs.unlinkSync(fixPromptFile); } catch (_) {}
        if (fixResult.status === 0) {
          log('fix', 'Fixes applied.');
          if (fixCwd !== REPO_ROOT) {
            try {
              execSync('git add -A && git commit -m "fix: address review feedback (cycle ' + cycle + ')"', { cwd: fixCwd, encoding: 'utf8' });
              log('fix', 'Committed fixes in worktree. Re-running review...');
            } catch (_) { log('fix', 'No changes to commit. Re-running review...'); }
          } else { log('fix', 'Re-running review...'); }
        } else {
          log('fix', 'Fix agent failed (exit ' + fixResult.status + '). Re-running review anyway...');
        }
      } catch (fixErr) {
        log('fix', 'Fix agent error: ' + fixErr.message + '. Re-running review anyway...');
      }
    }
  } catch (err) {
    log('error', 'Failed: ' + err.message);
    log('error', 'Session: .orchestration/' + sessionName + '/');
    costTracker.printSummary();
    process.exit(2);
  }
}

main();
