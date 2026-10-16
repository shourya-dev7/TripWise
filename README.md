# TripWise — Smart Travel Planner

TripWise is a full-stack travel-planning application that helps users explore destinations, discover attractions, view destination details, and organize places into an itinerary.

## Features

- **Destination Discovery:** Explore destinations and discover attractions using the OpenTripMap API.
- **Search, Filtering, and Sorting:** Find destinations using search, category filters, and alphabetical sorting.
- **Destination Details:** View useful information about a selected destination.
- **My Trip:** Add destinations to an itinerary, review saved destinations, and remove items.
- **Database Persistence:** Store destination and itinerary data using PostgreSQL.
- **Progressive Attraction Loading:** Display attraction results as additional information becomes available.
- **Error and Empty States:** Show feedback when searches fail or no destinations are saved.

## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- CSS
- Axios

### Backend
- Node.js
- Express
- PostgreSQL
- OpenTripMap API

## Project Structure

```text
TripWise/
├── backend/
│   ├── db.js
│   ├── destinations.js
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js and npm
- PostgreSQL
- An OpenTripMap API key

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/shourya-dev7/TripWise.git
cd TripWise
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file inside `backend/` and configure the environment variables required by the backend. Do not commit this file or expose API keys.

### 3. Configure PostgreSQL

Create a PostgreSQL database named `tripwise`. Configure the database connection variables expected by `backend/db.js` and `backend/server.js`.

Create the required tables and seed the destination data according to the database setup used by this project.

### 4. Start the backend

From the `backend/` directory, run the start script defined in `package.json`.

### 5. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite.

## API Documentation

The backend provides REST endpoints for destination data and itinerary management, as well as an external attraction-discovery endpoint.

Check `backend/server.js` for the current routes, supported query parameters, request bodies, and response formats.

## Environment Variables

Keep API keys, database passwords, and other secrets in local environment files or deployment environment settings. Never commit `.env` files to GitHub.

## Current Status

The core frontend, backend, PostgreSQL integration, destination discovery, and itinerary workflows have been implemented and tested locally. Public deployment and final submission documentation are still in progress.

## Author

Shourya Kumar Gupta

GitHub: [shourya-dev7](https://github.com/shourya-dev7)