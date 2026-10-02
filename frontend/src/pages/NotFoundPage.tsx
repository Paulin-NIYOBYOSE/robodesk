import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { buttonStyles } from '../components/ui/buttonStyles'
import { EmptyState } from '../components/ui/States'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Link to="/" className={buttonStyles('secondary')}>
          Go to dashboard
        </Link>
      }
    />
  )
}
