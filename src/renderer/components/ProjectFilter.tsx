interface ProjectFilterProps {
  projects: string[]
  value: string
  onChange: (value: string) => void
}

export function ProjectFilter({ projects, value, onChange }: ProjectFilterProps): JSX.Element {
  return (
    <label className="filter-control">
      <span className="filter-control__label">Project</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project} value={project}>
            {project}
          </option>
        ))}
      </select>
    </label>
  )
}
