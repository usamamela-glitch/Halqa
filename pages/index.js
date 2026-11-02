import dynamic from 'next/dynamic'
import Recover from '../components/Recover'

// The whole app runs in the browser (local database, offline sync), so it is
// rendered client-side only.
const App = dynamic(() => import('../components/App'), { ssr: false })

export default function Index() {
  return <Recover><App /></Recover>
}
