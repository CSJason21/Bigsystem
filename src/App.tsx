
import React from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './router';
import BackendReady from './components/BackendReady';

const App: React.FC = () => {
  const element = useRoutes(routes);
  return <BackendReady>{element}</BackendReady>;
};

export default App;
