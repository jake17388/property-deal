import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useSocket() {
  // The socket is state rather than a ref so the rest of the app sees it as
  // soon as it exists. Publishing it through a ref meant nothing could attach
  // a handler until some *other* render happened to come along, and anything
  // the server said in that window was heard by nobody.
  const [socket,    setSocket]    = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Ask for a websocket straight away. Socket.IO's default is to open on
    // HTTP long-polling and upgrade a moment later, and a move made in that
    // window costs a whole poll round trip — which is exactly the window in
    // which you play your first card.
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 20000,
    });
    setSocket(socket);
    setConnected(socket.connected);

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Wake the socket immediately when the user switches back to the app, or
    // when the device comes back online — waiting for the next reconnect
    // attempt is what left the board sitting behind "Reconnecting…".
    const wake = () => {
      if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);

    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      socket.disconnect();
      setSocket(null);
    };
  }, []);

  return { socket, connected };
}
