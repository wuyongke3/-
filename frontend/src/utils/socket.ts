let socket: null|WebSocket = null;
let heartBeatInterval: number|null = null;

export function initSocket() { 

    if (socket) {
        socket.close();
    }

    socket = new WebSocket('ws://localhost:3000');

    socket.onopen = function() { 
        console.log('socket open');
        heartBeatInterval = window.setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send("hello");
            } else {
                // Clear interval if connection is lost
                if (heartBeatInterval) clearInterval(heartBeatInterval);
            }
        }, 1000);
    };

    socket.onmessage = function(event) { 
        console.log(event.data);
    };

     socket.onerror = function (error) {
        console.error('WebSocket Error:', error);
        // Optional: Implement reconnection logic here
    };

     socket.onclose = function () {
        console.log('WebSocket Closed');
        if (heartBeatInterval) {
            clearInterval(heartBeatInterval);
            heartBeatInterval = null;
        }
    };
    
}

initSocket();