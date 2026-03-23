export type OnboardingStepType = "fullscreen" | "spotlight";

export type TooltipPosition = "top" | "bottom";

export interface OnboardingStep {
  id: string;
  type: OnboardingStepType;

  // Fullscreen card props
  title?: string;
  description?: string;
  icon?: "Dumbbell" | "PartyPopper";
  buttonText?: string;

  // Spotlight props
  targetId?: string;
  tooltipTitle?: string;
  tooltipDescription?: string;
  tooltipPosition?: TooltipPosition;
  spotlightPadding?: number;
  spotlightOffsetY?: number;

  // Navigation (for tab switching between steps)
  navigateTo?: string;
  navigateDelay?: number;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    type: "fullscreen",
    title: "Welcome to Fitbull!",
    description:
      "Let's take a quick tour so you know where everything is. It only takes a moment.",
    icon: "Dumbbell",
    buttonText: "Get Started",
  },
  {
    id: "workouts-tab",
    type: "spotlight",
    targetId: "tab-workouts",
    tooltipTitle: "Workouts",
    tooltipDescription:
      "This is your home base. All your workout templates and training plans live here.",
    tooltipPosition: "top",
    navigateTo: "/(tabs)",
    spotlightPadding: 18,
    spotlightOffsetY: 6,
  },
  {
    id: "create-template",
    type: "spotlight",
    targetId: "fab-create-template",
    tooltipTitle: "Create a Template",
    tooltipDescription:
      "Tap here to build reusable workout templates with your favorite exercises.",
    tooltipPosition: "top",
  },
  {
    id: "start-workout",
    type: "spotlight",
    targetId: "btn-start-empty",
    tooltipTitle: "Start a Workout",
    tooltipDescription:
      "Jump straight into a workout anytime, or pick a template you've saved.",
    tooltipPosition: "bottom",
  },
  {
    id: "stats-tab",
    type: "spotlight",
    targetId: "tab-stats",
    tooltipTitle: "Stats & History",
    tooltipDescription:
      "Track your progress with a calendar view, charts, personal records, and more.",
    tooltipPosition: "top",
    navigateTo: "/(tabs)/stats",
    navigateDelay: 300,
    spotlightPadding: 18,
    spotlightOffsetY: 6,
  },
  {
    id: "explore-tab",
    type: "spotlight",
    targetId: "tab-explore",
    tooltipTitle: "Explore Tools",
    tooltipDescription:
      "Find fitness calculators, browse meal ideas, and discover new tools.",
    tooltipPosition: "top",
    navigateTo: "/(tabs)/explore",
    navigateDelay: 300,
    spotlightPadding: 18,
    spotlightOffsetY: 6,
  },
  {
    id: "chat-tab",
    type: "spotlight",
    targetId: "tab-chat",
    tooltipTitle: "AI Fitness Coach",
    tooltipDescription:
      "Chat with your AI coach for personalized workout plans, meal suggestions, and answers to any fitness question.",
    tooltipPosition: "top",
    navigateTo: "/(tabs)/chat",
    navigateDelay: 300,
    spotlightPadding: 18,
    spotlightOffsetY: 6,
  },
  {
    id: "completion",
    type: "fullscreen",
    title: "You're All Set!",
    description:
      "Start by creating your first workout template, or chat with your AI coach for a personalized plan.",
    icon: "PartyPopper",
    buttonText: "Start Training",
  },
];

export const TOTAL_STEPS = ONBOARDING_STEPS.length;
