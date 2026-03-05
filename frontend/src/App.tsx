import { Routes, Route } from "react-router"
import { AuthProvider } from "./lib/auth"
import HomePage from "./pages/HomePage"
import TaskView from "./pages/TaskView"
import Dashboard from "./pages/Dashboard"

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/task/:id" element={<TaskView />} />
      </Routes>
    </AuthProvider>
  )
}
