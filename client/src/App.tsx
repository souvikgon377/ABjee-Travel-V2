import './App.css'
import { ThemeProvider } from './components/mvpblocks/theme-provider'
import { AuthProvider } from './contexts/AuthContext'
import Home from './Pages/HomePage';
import LandingPage from './Pages/LandingPage'
import ChatPage from './Pages/ChatPage';
import AuthPage from './Pages/AuthPage';
import {BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import HotelList from './components/bookings/hotel_list';
import CabBooking from './components/bookings/cab_booking';
import CarRental from './components/bookings/car_rental';
import BikeRental from './components/bookings/bike_rental';
import AddHotel from './components/bookings/add_hotel';

import BookingCategories from './components/bookings/booking_categories';


function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path='/home' element={<Home/>} />
            <Route path='/auth' element={<AuthPage />} />
            <Route path='/chat/*' element={<ChatPage />} />
            <Route path="/test" element={
              <div style={{padding: '20px'}}>
                <h1>Test Route Works!</h1>
                <Link to="/">Back to Home</Link>
                <br />
                <Link to="/chat">Go to Chat</Link>
              </div>
            } />
           <Route path='/booking-categories' element={<BookingCategories/>}></Route>
            <Route path='/hotel-list' element={<HotelList/>}></Route>
            <Route path='/cab-booking' element={<CabBooking/>}></Route>
            <Route path='/car-rental' element={<CarRental/>}></Route>
            <Route path='/bike-rental' element={<BikeRental/>}></Route>
            <Route path='/add-hotel' element={<AddHotel/>}></Route>
            {/* <Route path="/about" element={<div><AboutPage /></div>} /> */}
            {/* <Route path="/contact" element={<ContactPage />} /> */}
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
