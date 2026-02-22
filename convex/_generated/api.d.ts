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
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as chatInternal from "../chatInternal.js";
import type * as exercises from "../exercises.js";
import type * as http from "../http.js";
import type * as plans from "../plans.js";
import type * as recipes from "../recipes.js";
import type * as settings from "../settings.js";
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
  auth: typeof auth;
  chat: typeof chat;
  chatActions: typeof chatActions;
  chatInternal: typeof chatInternal;
  exercises: typeof exercises;
  http: typeof http;
  plans: typeof plans;
  recipes: typeof recipes;
  settings: typeof settings;
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
