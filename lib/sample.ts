// Sample data so the home screen has something to show before accounts are connected.
// Each block is replaced by live data in phase 1 (timetable, tasks, calendar),
// phase 3 (AI briefing) and phase 4 (habits, shifts).

export const SAMPLE_PERIODS = [
  { slot: "Period 1", name: "Maths Extension 1" },
  { slot: "Period 2", name: "English Standard" },
  { slot: "Recess", name: "—" },
  { slot: "Period 3", name: "Physics", next: true },
  { slot: "Period 4", name: "Engineering Studies" },
  { slot: "Lunch", name: "—" },
  { slot: "Period 5", name: "VET Entertainment" },
];

export const SAMPLE_TASKS = [
  { id: "t1", title: "Practice set", subject: "Maths Advanced", source: "Canvas", due: "Thu" },
  { id: "t2", title: "Engineering report", subject: "Engineering Studies", source: "Canvas", due: "Fri" },
  { id: "t3", title: "Essay draft", subject: "English Standard", source: "Compass", due: "Mon" },
  { id: "t4", title: "Depth study proposal", subject: "Physics", source: "Google Classroom", due: "Next wk" },
];

export const SAMPLE_HABITS = [
  { name: "Study 1 hr", done: 2 },
  { name: "Sleep by 10:30", done: 1 },
  { name: "Training", done: 1 },
];
