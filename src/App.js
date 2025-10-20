import React, { useState } from 'react';
import './App.css';
import MenuScreen from './components/MenuScreen';
import SerialTerminal from './components/SerialTerminal';
import PIDGraphPlotter from './components/PIDGraphPlotter';
import { SerialProvider } from './contexts/SerialContext';

function App() {
  const [currentView, setCurrentView] = useState('menu');

  const renderCurrentView = () => {
    switch (currentView) {
      case 'terminal':
        return <SerialTerminal onBack={() => setCurrentView('menu')} />;
      case 'plotter':
        return <PIDGraphPlotter onBack={() => setCurrentView('menu')} />;
      default:
        return <MenuScreen onSelectFeature={setCurrentView} />;
    }
  };

  return (
    <SerialProvider>
      <div className="App">
        <header className="App-header">
          <h1>Web Serial Plotter</h1>
        </header>
        <main className="App-main">
          {renderCurrentView()}
        </main>
      </div>
    </SerialProvider>
  );
}

export default App;
