const PageSection = ({ title, description, children, actions }) => (
  <section className="card-surface surface-grid surface-gradient relative overflow-hidden">
    <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {description && <p className="text-sm text-slate-400">{description}</p>}
      </div>
      {actions}
    </div>
    <div className="relative z-10 mt-4">{children}</div>
  </section>
)

export default PageSection
