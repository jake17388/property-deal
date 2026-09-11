import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Ask for a websocket straight away. Socket.IO's default is to open on
    // HTTP long-polling and upgrade a moment later, and a move made in that
    // window costs a whole poll round trip — which is exactly the window in
    // which you play your first card.
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 3000,
    });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Wake the socket immediately when the user switches back to the app
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !socket.connected) {
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, connected };
}
