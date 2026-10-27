const PATHS = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  timetable: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  tasks: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 13l2 2 4-4",
  hsc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  cards: "M3 8h14v12H3zM7 4h14v12h-2",
  planner: "M3 6h18M3 12h11M3 18h7M15 17l2 2 4-4",
  tutor: "M4 5h16v11H9l-5 4zM9 10h6M9 13h3",
  summaries: "M12 16V4M7 9l5-5 5 5M4 20h16",
  notes: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  todo: "M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8",
  shifts: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
  pay: "M3 6h18v13H3zM3 10h18M16 14.5h2",
  habits: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z",
  settings: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  collapse: "M3 4h18v16H3zM9 4v16M16 9l-3 3 3 3",
  expand: "M3 4h18v16H3zM9 4v16M13 9l3 3-3 3",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  play: "M8 5l11 7-11 7z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  phone: "M8 2h8v20H8zM11 18h2",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  canvas: "M4 4h16v16H4zM4 9h16M9 9v11",
  google: "M20 12a8 8 0 1 1-2.3-5.6M20 12h-8",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M4 12l5 5L20 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
