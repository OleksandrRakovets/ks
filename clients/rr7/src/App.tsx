import { createBrowserRouter, RouterProvider } from 'react-router'

import { AdminCreateMatch } from './routes/AdminCreateMatch'
import { ControlMatch } from './routes/ControlMatch'
import { PublicScoreboard } from './routes/PublicScoreboard'

const router = createBrowserRouter([
  { path: '/admin/create', element: <AdminCreateMatch /> },
  { path: '/c/:matchId/:controlSecret', element: <ControlMatch /> },
  { path: '/m/:matchId', element: <PublicScoreboard /> },
  { path: '*', element: <AdminCreateMatch /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
