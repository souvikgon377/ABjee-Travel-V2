import { lazy, Suspense } from 'react'
import { ThemeProvider } from './components/mvpblocks/theme-provider'
import { AuthProvider } from './contexts/AuthContext'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

// Lazy load pages
const LandingPage = lazy(() => import('./Pages/LandingPage'))
const HomePage = lazy(() => import('./Pages/HomePage'))
const AuthPage = lazy(() => import('./Pages/AuthPage'))
const ChatPage = lazy(() => import('./Pages/ChatPage'))
const AdminPage = lazy(() => import('./Pages/AdminPage'))
const BookingCategories = lazy(() => import('./components/bookings/booking_categories'))
const HotelList = lazy(() => import('./components/bookings/hotel_list'))
const CabBooking = lazy(() => import('./components/bookings/cab_booking'))
const CarRental = lazy(() => import('./components/bookings/car_rental'))
const BikeRental = lazy(() => import('./components/bookings/bike_rental'))
const AddHotel = lazy(() => import('./components/bookings/add_hotel'))

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
