import { lazy, Suspense } from 'react'
import { ThemeProvider } from './components/mvpblocks/theme-provider'
import { AuthProvider } from './contexts/AuthContext'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { lazyWithRetry } from './lib/lazyWithRetry'

// Lazy load pages
const LandingPage = lazyWithRetry(() => import('./Pages/LandingPage'))
const HomePage = lazyWithRetry(() => import('./Pages/HomePage'))
const AuthPage = lazyWithRetry(() => import('./Pages/AuthPage'))
const ChatPage = lazyWithRetry(() => import('./Pages/ChatPage'))
const AdminPage = lazyWithRetry(() => import('./Pages/AdminPage'))
const BookingCategories = lazyWithRetry(() => import('./components/bookings/booking_categories'))
const HotelList = lazyWithRetry(() => import('./components/bookings/hotel_list'))
const CabBooking = lazyWithRetry(() => import('./components/bookings/cab_booking'))
const CarRental = lazyWithRetry(() => import('./components/bookings/car_rental'))
const BikeRental = lazyWithRetry(() => import('./components/bookings/bike_rental'))
const AddHotel = lazyWithRetry(() => import('./components/bookings/add_hotel'))

const LoadingFallback = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
)

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <Router>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/chat/*" element={<ChatPage />} />
              <Route path="/booking-categories" element={<BookingCategories />} />
              <Route path="/hotel-list" element={<HotelList />} />
              <Route path="/cab-booking" element={<CabBooking />} />
              <Route path="/car-rental" element={<CarRental />} />
              <Route path="/bike-rental" element={<BikeRental />} />
              <Route path="/add-hotel" element={<AddHotel />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App;
