import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './responsive.css'
import './parameter-controls.css'
import './manual-mode.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
