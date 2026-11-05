import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles/base.css';
import './styles/theme.css';
import './styles/home.css';
import './styles/delivery.css';
import './styles/responsive.css';
createRoot(document.getElementById('root')).render(<App/>);
