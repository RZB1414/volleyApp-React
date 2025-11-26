import { Link } from 'react-router-dom'
import PageSection from '@/components/PageSection.js'

const NotFound = () => (
  <PageSection title="404" description="Page not found">
    <p className="text-slate-300">Oops, we could not find what you were looking for.</p>
    <Link to="/" className="btn-primary mt-4 inline-flex w-fit">
      Back to dashboard
    </Link>
  </PageSection>
)

export default NotFound
