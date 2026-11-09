"use client";

import { useMySubjects } from "@/components/MySubjects";
import { choicesFor, coreFor, GENERAL_SUBJECT, SUBJECT_GROUPS, type SubjectGroup } from "@/lib/subjects";

// A <select> of subjects: "My subjects" first, then the other subjects for your
// year, then General / Other. With no year set yet it lists every subject.
export function SubjectOptions() {
  const { year, subjects } = useMySubjects();
  const mine = new Set(subjects);
  const groups: SubjectGroup[] = year
    ? [
        { label: "My subjects", subjects },
        { label: "Core", subjects: coreFor(year).filter((s) => !mine.has(s)) },
        ...choicesFor(year).map((g) => ({ ...g, subjects: g.subjects.filter((s) => !mine.has(s)) })),
        { label: "Other", subjects: [GENERAL_SUBJECT] },
      ]
    : SUBJECT_GROUPS;
  const seen = new Set<string>();
  return (
    <>
      {groups.map((g) => {
        const list = g.subjects.filter((s) => !seen.has(s) && (seen.add(s), true));
        return list.length ? (
          <optgroup key={g.label} label={g.label}>
            {list.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}

export function SubjectSelect({
  name = "subject",
  emptyLabel = "No subject",
  label = "Subject",
  ...rest
}: {
  name?: string;
  emptyLabel?: string | null; // null = no empty option
  label?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <select name={name} className="input" aria-label={label} {...rest}>
      {emptyLabel !== null ? <option value="">{emptyLabel}</option> : null}
      <SubjectOptions />
    </select>
  );
}
