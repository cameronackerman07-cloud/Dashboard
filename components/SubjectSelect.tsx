import { SUBJECT_GROUPS } from "@/lib/subjects";

// A <select> of every NSW Stage 6 subject, "My courses" first. Works in both
// server and client components (no state of its own).
export function SubjectOptions() {
  return (
    <>
      {SUBJECT_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </optgroup>
      ))}
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
