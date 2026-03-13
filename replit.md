# Water Hammer Analysis Dashboard

## Overview
A React-based dashboard for real-time visualization and analysis of WHAMO (Water Hammer and Mass Oscillation) simulation data. Users can upload `.TAB` files and view charts and analysis of the simulation output.

## Tech Stack
- **Framework**: React 19 (Create React App / react-scripts 5)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Package Manager**: npm

## Project Structure
- `src/App.js` - Root component, renders WaterHammerDashboard
- `src/WaterHammerDashboard.js` - Main dashboard component
- `src/index.js` - React entry point
- `public/` - Static assets and HTML template

## Running the App
The dev server runs on port 5000 with host 0.0.0.0:
```
PORT=5000 HOST=0.0.0.0 npm start
```

## Deployment
Configured as a static site deployment:
- Build command: `npm run build`
- Public directory: `build`
