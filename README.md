# TripWise — Smart Travel Planner

TripWise is a full-stack travel-planning web application that helps users explore destinations, discover nearby attractions, view destination details, and organize destinations into a personal itinerary.

**Live Demo:** https://tripwise-frontend-7cq2.onrender.com/  
**Backend API:** https://tripwise-backend-4t2x.onrender.com/  
**GitHub Repository:** https://github.com/shourya-dev7/TripWise

**Selected Track:** Full-Stack Development

**External API:** OpenTripMap API for discovering nearby attractions.

**Deployment:** Frontend and backend hosted on Render, with PostgreSQL hosted on Neon.

## Features

- **Destination Discovery:** Explore destinations and discover attractions using the OpenTripMap API.
- **Search, Filtering, and Sorting:** Search destinations, filter by category, and sort alphabetically.
- **Destination Details:** View information about a selected destination and add it to your trip.
- **My Trip:** Add destinations to your itinerary, review saved destinations, and remove items.
- **PostgreSQL Persistence:** Store destination and itinerary data in a PostgreSQL database.
- **Progressive Attraction Loading:** Display attraction results as additional information becomes available.
- **Error Handling:** Provide feedback for invalid city searches and other unsuccessful requests.
- **Responsive Interface:** Use the application on desktop and mobile-sized screens.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS, Axios |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| External API | OpenTripMap API |
| Deployment | Render |
| Database Hosting | Neon PostgreSQL |

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

## Getting Started

### Prerequisites

Install the following before running the project locally:

- Node.js and npm
- PostgreSQL, or access to a compatible PostgreSQL database
- An OpenTripMap API key

### 1. Clone the repository

```bash
git clone https://github.com/shourya-dev7/TripWise.git
cd TripWise
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend/` directory. Configure the environment variables required by the backend.

Example configuration:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=tripwise
DB_USER=your_postgres_username
DB_PASSWORD=your_postgres_password

OPENTRIPMAP_API_KEY=your_opentripmap_api_key
```

Replace the example database credentials and API key with your own values. Never commit your `.env` file or expose your credentials publicly.

### 3. Set up PostgreSQL

Create a PostgreSQL database named `tripwise`.

Create and populate the required tables using the database schema and destination data for this project. Ensure the database connection configuration matches your local PostgreSQL setup.

### 4. Start the backend

From the `backend/` directory, run:

```bash
npm start
```

The backend should start on `http://localhost:5000` if port `5000` is configured and available.

### 5. Configure and start the frontend

Open a second terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend/` with the local backend API URL:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

Open the local URL displayed in the terminal by Vite.

## API Overview

The backend exposes REST endpoints for destination management, itinerary operations, health checks, and external attraction discovery.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Check the backend service |
| GET | `/api/health` | Check backend health |
| GET | `/api/destinations` | Retrieve destinations |
| GET | `/api/destinations/:id` | Retrieve a destination by ID |
| GET | `/api/itinerary` | Retrieve saved itinerary items |
| POST | `/api/itinerary` | Add a destination to the itinerary |
| DELETE | `/api/itinerary/:destinationId` | Remove a destination from the itinerary |
| GET | `/api/external/places` | Discover attractions through the external API |

**Note:** Refer to `backend/server.js` for the exact request parameters, request body formats, validation rules, and response structures.

## Environment Variables and Security

- Keep API keys, database passwords, and other credentials in environment variables.
- Do not commit `.env` files or database backups containing sensitive information.
- Configure production environment variables in the relevant hosting dashboards.
- The frontend uses `VITE_API_URL` to determine the backend API base URL.
- The backend uses PostgreSQL for persistent data storage and the OpenTripMap API for attraction discovery.

## Deployment

TripWise is deployed using Render for the frontend and backend, with Neon PostgreSQL providing the hosted database.

- **Frontend:** https://tripwise-frontend-7cq2.onrender.com/
- **Backend:** https://tripwise-backend-4t2x.onrender.com/
- **Repository:** https://github.com/shourya-dev7/TripWise

The deployed application supports destination exploration, attraction discovery, destination details, and itinerary management.

*Note: Free hosting services may take some time to respond after periods of inactivity.*

## Current Status

The core full-stack application has been implemented and deployed. The frontend, backend, PostgreSQL integration, destination discovery, and itinerary workflows have been tested. Further improvements to attraction image availability and duplicate-result handling may be made as part of final polish.

## Author

**Shourya Kumar Gupta**

GitHub: https://github.com/shourya-dev7
