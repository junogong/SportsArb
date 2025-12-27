import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Amplify configuration (using Amplify Gen 2 config)
import { Amplify } from 'aws-amplify'
import outputs from './amplifyconfiguration.json'
import '@aws-amplify/ui-react/styles.css'

// Check if running locally
const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
  window.location.hostname === "[::1]" ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

// Set redirect URL based on environment
const redirectUrl = isLocalhost ? 'http://localhost:5173/' : 'https://www.stakt.live/';

// Update config
const updatedConfig = {
  ...outputs,
  oauth: {
    ...outputs.oauth,
    redirectSignIn: redirectUrl,
    redirectSignOut: redirectUrl,
  }
}

Amplify.configure(updatedConfig)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
