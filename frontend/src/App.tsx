import { Routes, Route } from "react-router"
import HomePage from "./pages/HomePage"
import TaskView from "./pages/TaskView"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/task/:id" element={<TaskView />} />
    </Routes>
  )
}