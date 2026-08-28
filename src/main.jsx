import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CalculusLab from './CalculusLab.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CalculusLab />
  </StrictMode>,
)
