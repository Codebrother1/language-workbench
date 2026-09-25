import { useId, useState } from "react";
import { sectionKinds, type WritingSection } from "./domain";
import { Select } from "./ui";
import { sectionConcepts } from "./section-purpose";

type Kind = WritingSection["kind"];

/** The same compact explanation can sit beside any section-concept control. */
export function SectionConceptHelp({
  kind,
  id,
  visible,
}: {
  kind: Kind;
  id: string;
  visible: boolean;
}) {
  const concept = sectionConcepts[kind];
  return (
    <div
      id={id}
      role="tooltip"
      className="section-concept-help"
      hidden={!visible}
    >
      <strong>
        {concept.name} <small>{concept.category}</small>
      </strong>
      <span>{concept.shortDescription}</span>
      <small>Best when: {concept.whenToUse}</small>
    </div>
  );
}

/** Keep native select keyboard behavior; explain its currently selected concept. */
export function SectionConceptSelect({
  label,
  value,
  onChange,
  options = sectionKinds,
}: {
  label: string;
  value: Kind;
  onChange: (kind: Kind) => void;
  options?: readonly Kind[];
}) {
  const selectId = useId();
  const helpId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div className="field section-concept-field">
      <label htmlFor={selectId}>{label}</label>
      <Select
        id={selectId}
        value={value}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value as Kind)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {options.map((kind) => (
          <option key={kind} value={kind}>
            {kind} — {sectionConcepts[kind].rhetoricalJob}
          </option>
        ))}
      </Select>
      <SectionConceptHelp
        id={helpId}
        kind={value}
        visible={hovered || focused}
      />
    </div>
  );
}
