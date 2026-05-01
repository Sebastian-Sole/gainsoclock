/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiTools from "../aiTools.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as authInternal from "../authInternal.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as chatInternal from "../chatInternal.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as exerciseLibrary from "../exerciseLibrary.js";
import type * as exercises from "../exercises.js";
import type * as http from "../http.js";
import type * as mealLogs from "../mealLogs.js";
import type * as migrations from "../migrations.js";
import type * as nutritionGoals from "../nutritionGoals.js";
import type * as onboarding from "../onboarding.js";
import type * as onboardingActions from "../onboardingActions.js";
import type * as onboardingInternal from "../onboardingInternal.js";
import type * as openaiConfig from "../openaiConfig.js";
import type * as plans from "../plans.js";
import type * as posthogServer from "../posthogServer.js";
import type * as recipes from "../recipes.js";
import type * as revenuecatTypes from "../revenuecatTypes.js";
import type * as settings from "../settings.js";
import type * as subscriptionCrons from "../subscriptionCrons.js";
import type * as subscriptions from "../subscriptions.js";
import type * as templates from "../templates.js";
import type * as user from "../user.js";
import type * as validators from "../validators.js";
import type * as workoutLogs from "../workoutLogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiTools: typeof aiTools;
  analytics: typeof analytics;
  auth: typeof auth;
  authInternal: typeof authInternal;
  chat: typeof chat;
  chatActions: typeof chatActions;
  chatInternal: typeof chatInternal;
  crons: typeof crons;
  email: typeof email;
  exerciseLibrary: typeof exerciseLibrary;
  exercises: typeof exercises;
  http: typeof http;
  mealLogs: typeof mealLogs;
  migrations: typeof migrations;
  nutritionGoals: typeof nutritionGoals;
  onboarding: typeof onboarding;
  onboardingActions: typeof onboardingActions;
  onboardingInternal: typeof onboardingInternal;
  openaiConfig: typeof openaiConfig;
  plans: typeof plans;
  posthogServer: typeof posthogServer;
  recipes: typeof recipes;
  revenuecatTypes: typeof revenuecatTypes;
  settings: typeof settings;
  subscriptionCrons: typeof subscriptionCrons;
  subscriptions: typeof subscriptions;
  templates: typeof templates;
  user: typeof user;
  validators: typeof validators;
  workoutLogs: typeof workoutLogs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
