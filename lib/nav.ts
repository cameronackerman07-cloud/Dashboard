import type { IconName } from "@/components/Icon";

export type NavItem = {
  slug: string; // "" for home
  label: string; // full label (expanded sidebar)
  short: string; // short label (collapsed rail)
  icon: IconName;
  blurb: string; // one-line description for the page header
  phase: number; // build phase it switches on in
  plans: string[]; // what the page will do
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        slug: "",
        label: "Home",
        short: "Home",
        icon: "home",
        blurb: "Your day at a glance",
        phase: 1,
        plans: [],
      },
      {
        slug: "calendar",
        label: "Calendar",
        short: "Calendar",
        icon: "calendar",
        blurb: "Every calendar in one view",
        phase: 1,
        plans: [
          "Merges your personal and school Google calendars",
          "Adds Canvas, Compass and Atlantis events from their calendar links",
          "Shows which account each event came from",
          "Gives you a link to subscribe from Apple Calendar on your iPhone",
        ],
      },
    ],
  },
  {
    label: "School",
    items: [
      {
        slug: "timetable",
        label: "Timetable",
        short: "Timetable",
        icon: "timetable",
        blurb: "Classes, rooms and what's next",
        phase: 1,
        plans: [
          "Pulls your classes from Atlantis Timetable",
          "Highlights the class that's on now and the next one",
          "Handles week A / week B rotations",
        ],
      },
      {
        slug: "assignments",
        label: "Assignments",
        short: "Tasks",
        icon: "tasks",
        blurb: "Everything due, from every school app",
        phase: 1,
        plans: [
          "Combines tasks from Canvas, Google Classroom and Compass",
          "Sorts by due date and subject",
          "Lets you tick tasks off and add your own",
          "An AI agent checks for new tasks and adds them to your study plan",
        ],
      },
    ],
  },
  {
    label: "Study",
    items: [
      {
        slug: "hsc-practice",
        label: "HSC practice",
        short: "HSC",
        icon: "hsc",
        blurb: "HSC-style questions with AI marking",
        phase: 2,
        plans: [
          "Pick a course and syllabus topic, get a new HSC-style question",
          "Links each topic to NESA past papers and marking guidelines",
          "Type or photograph your answer and get it marked against the guidelines",
          "Exam mode with real HSC time limits",
        ],
      },
      {
        slug: "flashcards",
        label: "Flashcards",
        short: "Cards",
        icon: "cards",
        blurb: "Made from your notes, spaced for memory",
        phase: 2,
        plans: [
          "Turns uploaded notes, PDFs and photos into flashcards",
          "Spaced repetition: cards you get wrong come back sooner",
          "One deck per course and topic",
        ],
      },
      {
        slug: "planner",
        label: "Study planner",
        short: "Planner",
        icon: "planner",
        blurb: "A weekly plan built around your life",
        phase: 2,
        plans: [
          "Builds study blocks around classes, shifts and sport",
          "Moves things automatically when a new task appears",
          "Adds blocks to your calendar if you want",
        ],
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        slug: "tutor",
        label: "AI tutor",
        short: "Tutor",
        icon: "tutor",
        blurb: "Hints first, full answers when you ask",
        phase: 3,
        plans: [
          "Chat about any of your seven courses",
          "Gives hints first, then the full worked solution if you ask",
          "Checks photos of your working",
          "Switches between free AI models automatically",
        ],
      },
      {
        slug: "summaries",
        label: "Summaries",
        short: "Summary",
        icon: "summaries",
        blurb: "Notes, PDFs and photos, summarised",
        phase: 3,
        plans: [
          "Upload notes, worksheets or textbook pages",
          "Get a short summary and key points",
          "Send the result straight to flashcards",
        ],
      },
    ],
  },
  {
    label: "Personal",
    items: [
      {
        slug: "notes",
        label: "Notes",
        short: "Notes",
        icon: "notes",
        blurb: "Quick notes, synced everywhere",
        phase: 4,
        plans: ["Quick notes on any device", "Search across notes and school work"],
      },
      {
        slug: "todo",
        label: "To-do",
        short: "To-do",
        icon: "todo",
        blurb: "Personal tasks",
        phase: 4,
        plans: ["Personal to-do list", "Syncs with Apple Reminders through a Shortcut"],
      },
      {
        slug: "shifts",
        label: "Shifts",
        short: "Shifts",
        icon: "shifts",
        blurb: "Work and sport schedule",
        phase: 4,
        plans: [
          "Your work shifts and sport in one place",
          "Feeds into the study planner so it never clashes",
        ],
      },
      {
        slug: "pay",
        label: "Pay & budget",
        short: "Pay",
        icon: "pay",
        blurb: "Earnings and spending",
        phase: 4,
        plans: [
          "Estimates pay from your shifts",
          "Simple budget and savings goals",
        ],
      },
      {
        slug: "habits",
        label: "Habits",
        short: "Habits",
        icon: "habits",
        blurb: "Streaks and goals",
        phase: 4,
        plans: ["Track study, sleep and training streaks", "Weekly check-in"],
      },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

export const COURSES = [
  "Engineering Studies",
  "Mathematics Advanced",
  "Mathematics Extension 1",
  "Mathematics Extension 2",
  "Physics",
  "VET Entertainment",
  "English Standard",
];
