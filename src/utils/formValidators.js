const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateLogin = ({ email, password }) => {
  const errors = {}
  if (!emailRegex.test(email || '')) {
    errors.email = 'A valid email is required'
  }
  if (!password || password.length < 6) {
    errors.password = 'Password must be at least 6 characters long'
  }
  return errors
}

export const validateRegister = ({ name, email, password, age, yearsAsAProfessional }) => {
  const errors = { ...validateLogin({ email, password }) }
  if (!name || name.length < 2) {
    errors.name = 'Name is required'
  }
  if (age && (Number(age) < 10 || Number(age) > 100)) {
    errors.age = 'Age must be between 10 and 100'
  }
  if (yearsAsAProfessional) {
    const numericYear = Number(yearsAsAProfessional)
    const currentYear = new Date().getFullYear()
    if (Number.isNaN(numericYear) || numericYear < 1950 || numericYear > currentYear) {
      errors.yearsAsAProfessional = `Year must be between 1950 and ${currentYear}`
    }
  }
  if (!password || password.length < 9) {
    errors.password = 'Password must be at least 9 characters long'
  }
  return errors
}

export const hasErrors = (errors) => Object.values(errors).some(Boolean)

export const mergeFieldErrors = (localErrors = {}, apiErrors = {}) => {
  const merged = { ...localErrors }
  Object.entries(apiErrors).forEach(([key, value]) => {
    if (typeof value === 'string') {
      merged[key] = value
    }
    if (Array.isArray(value)) {
      merged[key] = value.join(', ')
    }
  })
  return merged
}
