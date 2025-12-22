import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Amplify configuration (using Amplify Gen 2 config)
import { Amplify } from 'aws-amplify'
import outputs from './amplifyconfiguration.json'
import '@aws-amplify/ui-react/styles.css'
Amplify.configure(outputs)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
