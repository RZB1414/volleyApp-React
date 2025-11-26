const baseClasses = 'w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-50 placeholder-slate-500 focus:border-emerald-400 focus:outline-none'

const FormField = ({ label, error, children, htmlFor }) => (
  <label className="flex w-full flex-col gap-2 text-sm font-semibold text-slate-200" htmlFor={htmlFor}>
    {label}
    {children}
    {error && <span className="text-xs font-normal text-rose-300">{error}</span>}
  </label>
)

export const Input = ({ error, className = '', ...props }) => (
  <input className={`${baseClasses} ${error ? 'border-rose-400' : ''} ${className}`} {...props} />
)

export const Select = ({ error, className = '', children, ...props }) => (
  <select className={`${baseClasses} ${error ? 'border-rose-400' : ''} ${className}`} {...props}>
    {children}
  </select>
)

export default FormField
