import type { IconName } from "@/components/Icon";

export type NavItem = {
  slug: string; // "" for home
  label: string; // full label (expanded sidebar)
  short: string; // short label (collapsed rail)
  icon: IconName;
  blurb: string; // one-line description for the page header
  phase: number; // build phase it switches on in
  plans: string[]; // what the page will do
  built?: boolean; // true once the page has its own folder (no longer a placeholder)
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
        built: true,
        plans: [
          "Add, edit and delete your own events",
          "Day, week, month and agenda views, with a jump-to-date box",
          "Merges your personal and school Google calendars",
          "Adds Canvas and Atlantis events from their calendar links",
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
        built: true,
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
        built: true,
        plans: [
          "Combines tasks from Canvas and Google Classroom",
          "Sorts by due date and subject",
          "Lets you tick tasks off and add your own",
          "An AI agent checks for new tasks and adds them to your study plan",
        ],
      },
      {
        slug: "key-dates",
        label: "Key dates",
        short: "Dates",
        icon: "flag",
        blurb: "Your exam dates, trials, assessments and countdowns",
        phase: 6,
        built: true,
        
        plans: ["Your own HSC exam dates once NESA releases the timetable", "Countdowns you add yourself"],
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
        built: true,
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
        blurb: "Every card by subject, module and topic, spaced for memory",
        phase: 2,
        built: true,
        plans: [
          "Cards from Summaries uploads, HSC practice mistakes and your own",
          "Browse by subject, module and topic; study due cards, any group, or everything",
          "Spaced repetition: cards you get wrong come back sooner",
          "A daily AI check hides duplicate cards (you can restore them)",
        ],
      },
      {
        slug: "planner",
        label: "Study planner",
        short: "Planner",
        icon: "planner",
        blurb: "A weekly plan built around your life",
        phase: 2,
        built: true,
        plans: [
          "Builds study blocks around classes, shifts and sport",
          "Moves things automatically when a new task appears",
          "Adds blocks to your calendar if you want",
        ],
      },
      {
        slug: "timer",
        label: "Timer",
        short: "Timer",
        icon: "timer",
        blurb: "Study timer and your total external study hours",
        phase: 6,
        built: true,
        plans: ["Timer that survives refreshes and switching devices", "Total external study hours by subject, week and term"],
      },
      {
        slug: "coach",
        label: "Coach",
        short: "Coach",
        icon: "coach",
        blurb: "Marks, targets and a plan towards your ATAR",
        phase: 3,
        built: true,
        plans: ["Tracks assessment marks and trends", "Target HSC marks per course", "Topic guides and study methods with sources"],
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
        built: true,
        plans: [
          "Chat about any of your seven courses",
          "Gives hints first, then the full worked solution if you ask",
          "Checks photos of your working",
          "Switches between free AI models automatically",
        ],
      },
      {
        slug: "inbox",
        label: "Inbox",
        short: "Inbox",
        icon: "inbox",
        blurb: "Briefings and reports from The BRIAN",
        phase: 3,
        built: true,
        plans: ["Morning briefing, Sunday reset and urgent alerts", "What each agent found", "Mark all read"],
      },
      {
        slug: "ai-agents",
        label: "AI Agents",
        short: "Agents",
        icon: "agents",
        blurb: "Your team of agents, all reporting to The BRIAN",
        phase: 3,
        built: true,
        plans: ["Each agent does one job on a schedule", "Rename, switch off, or change what they read", "Make your own agent in plain words"],
      },
      {
        slug: "summaries",
        label: "Summaries",
        short: "Summary",
        icon: "summaries",
        blurb: "Upload notes, get a summary and flashcards",
        phase: 3,
        built: true,
        plans: [
          "Upload a PowerPoint, PDF, Word file or a photo: pictures and charts are read too",
          "Get a summary with key points, filed under the right subject",
          "Flashcards are made automatically, skipping ones you already have",
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
        built: true,
        plans: ["Quick notes on any device", "Search titles and text, filter by subject", "Pin the important ones to the top"],
      },
      {
        slug: "todo",
        label: "To-do",
        short: "To-do",
        icon: "todo",
        blurb: "Personal tasks",
        phase: 4,
        built: true,
        plans: [
          "Quick-add personal to-dos with a due date, subject and priority",
          "Grouped into Overdue, Today, Upcoming, No date and Done",
          "Dated to-dos show in Home's Due soon",
        ],
      },
      {
        slug: "shifts",
        label: "Shifts",
        short: "Shifts",
        icon: "shifts",
        blurb: "Work and sport schedule",
        phase: 4,
        built: true,
        plans: [
          "Your work, refereeing and gig shifts by week",
          "Hours and estimated pay per week, with clash warnings",
          "Repeat a shift weekly",
        ],
      },
      {
        slug: "pay",
        label: "Pay & budget",
        short: "Pay",
        icon: "pay",
        blurb: "Earnings and spending",
        phase: 4,
        built: true,
        plans: [
          "Income, spending and what's left each month",
          "Spending by category against monthly limits",
          "Savings goals, and estimated pay from your shifts",
        ],
      },
      {
        slug: "life",
        label: "My life",
        short: "Life",
        icon: "life",
        blurb: "Your week outside school, kept in balance",
        phase: 6,
        built: true,
        
        plans: ["Training, family, social and work in one week view", "Asks \"Should I go?\" against your real schedule"],
      },
      {
        slug: "habits",
        label: "Habits",
        short: "Habits",
        icon: "habits",
        blurb: "Streaks and goals",
        phase: 4,
        built: true,
        plans: ["Tick off today's habits", "Current and best streaks", "The last 14 days at a glance"],
      },
      {
        slug: "money-ideas",
        label: "Money ideas",
        short: "Ideas",
        icon: "ideas",
        blurb: "Easy, safe ways to earn around school",
        phase: 4,
        built: true,
        plans: ["Ranked ideas for your situation", "Log hours and earnings", "A weekly money strategy from The BRIAN"],
      },
      {
        slug: "profile",
        label: "About me",
        short: "Me",
        icon: "profile",
        blurb: "What the app remembers about you",
        phase: 4,
        built: true,
        plans: ["A short questionnaire", "Facts you confirm, edit or reject", "Download or forget everything"],
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
