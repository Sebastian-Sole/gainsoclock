'use strict';

// Cost tracker - standalone module, no external dependencies

const CHARS_PER_TOKEN = 4;

const PRICING = {
  'claude-haiku':  { input: 0.80,  output: 4.00,  provider: 'Claude', model: 'Haiku 4.5' },
  'claude-sonnet': { input: 3.00,  output: 15.00, provider: 'Claude', model: 'Sonnet 4.6' },
  'claude-opus':   { input: 15.00, output: 75.00, provider: 'Claude', model: 'Opus 4.6' },
  'codex':         { input: 2.50,  output: 10.00, provider: 'Codex',  model: 'default' },
  'codex-mini':    { input: 1.10,  output: 4.40,  provider: 'Codex',  model: 'o4-mini' },
  'gemini-pro':    { input: 1.25,  output: 10.00, provider: 'Gemini', model: '2.5 Pro' },
  'gemini-flash':  { input: 0.15,  output: 0.60,  provider: 'Gemini', model: '2.5 Flash' },
};

const invocations = [];

function recordInvocation(backendKey, stage, prompt, output, durationMs, success) {
  var pricing = PRICING[backendKey] || { input: 3.00, output: 15.00, provider: 'Unknown', model: backendKey };
  var inputTokens = Math.ceil((prompt || '').length / CHARS_PER_TOKEN);
  var outputTokens = Math.ceil((output || '').length / CHARS_PER_TOKEN);
  var costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1e6;

  invocations.push({
    backendKey, stage,
    provider: pricing.provider || 'Unknown',
    model: pricing.model || backendKey,
    inputTokens, outputTokens, costUsd, durationMs, success
  });
}

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n) {
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function formatDuration(ms) {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + 'm';
  return (ms / 1000).toFixed(1) + 's';
}

function printSummary(logFn) {
  logFn = logFn || console.log;
  function l(msg) { logFn('[' + new Date().toLocaleTimeString() + '] [cost] ' + msg); }

  if (invocations.length === 0) { l('No invocations recorded.'); return; }

  l('-- USAGE SUMMARY --');
  l('');

  // Group by provider
  var byProvider = {};
  invocations.forEach(function(inv) {
    var key = inv.provider;
    if (!byProvider[key]) byProvider[key] = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0, failures: 0 };
    byProvider[key].calls++;
    byProvider[key].inputTokens += inv.inputTokens;
    byProvider[key].outputTokens += inv.outputTokens;
    byProvider[key].costUsd += inv.costUsd;
    byProvider[key].durationMs += inv.durationMs;
    if (!inv.success) byProvider[key].failures++;
  });

  l('  Provider    Calls   Input Tok   Output Tok   Est. Cost   Duration');
  l('  ----------  -----   ---------   ----------   ---------   --------');
  Object.entries(byProvider).forEach(function(e) {
    var name = e[0].padEnd(10);
    var d = e[1];
    l('  ' + name + '  ' + String(d.calls).padStart(5) + '   ' + formatTokens(d.inputTokens).padStart(9) + '   ' + formatTokens(d.outputTokens).padStart(10) + '   ' + formatCost(d.costUsd).padStart(9) + '   ' + formatDuration(d.durationMs).padStart(8));
  });

  l('');

  // Group by stage
  var byStage = {};
  invocations.forEach(function(inv) {
    var key = inv.stage;
    if (!byStage[key]) byStage[key] = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0, failures: 0 };
    byStage[key].calls++;
    byStage[key].inputTokens += inv.inputTokens;
    byStage[key].outputTokens += inv.outputTokens;
    byStage[key].costUsd += inv.costUsd;
    byStage[key].durationMs += inv.durationMs;
    if (!inv.success) byStage[key].failures++;
  });

  l('  Stage       Calls   Input Tok   Output Tok   Est. Cost   Duration');
  l('  ----------  -----   ---------   ----------   ---------   --------');
  Object.entries(byStage).forEach(function(e) {
    var name = e[0].padEnd(10);
    var d = e[1];
    l('  ' + name + '  ' + String(d.calls).padStart(5) + '   ' + formatTokens(d.inputTokens).padStart(9) + '   ' + formatTokens(d.outputTokens).padStart(10) + '   ' + formatCost(d.costUsd).padStart(9) + '   ' + formatDuration(d.durationMs).padStart(8));
  });

  l('');

  var totals = invocations.reduce(function(acc, inv) {
    acc.calls++; acc.inputTokens += inv.inputTokens; acc.outputTokens += inv.outputTokens;
    acc.costUsd += inv.costUsd; acc.durationMs += inv.durationMs;
    if (!inv.success) acc.failures++;
    return acc;
  }, { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0, failures: 0 });

  l('');
  l('  Note: Costs are estimates based on prompt/output size. Actual costs');
  l('  (especially for reviewers with subagents) will be higher. Check your');
  l('  provider dashboards for real usage.');
  l('');
  l('  Total: ' + totals.calls + ' calls, ' + formatTokens(totals.inputTokens) + ' input + ' + formatTokens(totals.outputTokens) + ' output tokens');
  l('  Est. cost: ' + formatCost(totals.costUsd) + '  |  Duration: ' + formatDuration(totals.durationMs) + '  |  ' + totals.failures + ' failures');
}

function getJsonSummary() {
  return { invocations: invocations };
}

module.exports = { recordInvocation, printSummary, getJsonSummary };
