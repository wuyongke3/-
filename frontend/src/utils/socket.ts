// src/utils/socket.ts
let socket: WebSocket | null = null;
let heartBeatInterval: number | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// 事件监听器映射
const eventListeners: { [key: string]: Function[] } = {};

export function initSocket() {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket("ws://localhost:3000");

  socket.onopen = function () {
    console.log("socket open");
    reconnectAttempts = 0; // 重置重连尝试次数

    heartBeatInterval = window.setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("heartbeat");
      } else {
        // Clear interval if connection is lost
        if (heartBeatInterval) clearInterval(heartBeatInterval);
      }
    }, 10000);

    // 触发连接事件
    emitEvent("open");
  };

  socket.onmessage = function (event) {
    try {
      // 尝试解析为JSON，如果是结构化消息
      const data = JSON.parse(event.data);
      emitEvent(data.type, data);
    } catch (e) {
      // 如果不是JSON格式，直接触发message事件
      emitEvent("message", { data: event.data });
    }
  };

  socket.onerror = function (error) {
    console.error("WebSocket Error:", error);
    emitEvent("error", error);
  };

  socket.onclose = function (event) {
    console.log("WebSocket Closed", event.code, event.reason);
    if (heartBeatInterval) {
      clearInterval(heartBeatInterval);
      heartBeatInterval = null;
    }

    // 触发关闭事件
    emitEvent("close", event);

    // 尝试重连（如果不是手动关闭）
    if (reconnectAttempts < maxReconnectAttempts) {
      setTimeout(() => {
        reconnectAttempts++;
        console.log(`尝试重连 (${reconnectAttempts}/${maxReconnectAttempts})`);
        initSocket();
      }, 3000); // 3秒后重连
    }
  };
}

// 发送数据
export function send(data: any) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    if (typeof data === "object") {
      socket.send(JSON.stringify(data));
    } else {
      socket.send(data);
    }
  } else {
    console.warn("WebSocket is not connected");
    throw new Error("WebSocket is not connected");
  }
}

// 订阅事件
export function on(eventType: string, callback: Function) {
  if (!eventListeners[eventType]) {
    eventListeners[eventType] = [];
  }
  eventListeners[eventType].push(callback);
}

// 取消订阅事件
export function off(eventType: string, callback?: Function) {
  if (!eventListeners[eventType]) return;

  if (callback) {
    const index = eventListeners[eventType].indexOf(callback);
    if (index > -1) {
      eventListeners[eventType].splice(index, 1);
    }
  } else {
    eventListeners[eventType] = [];
  }
}

// 获取WebSocket连接状态
export function getSocket() {
  return socket;
}

// 检查连接状态
export function isConnected() {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

// 内部方法：触发事件
function emitEvent(eventType: string, data?: any) {
  if (eventListeners[eventType]) {
    eventListeners[eventType].forEach((callback) => {
      callback(data);
    });
  }
}

// 关闭连接
export function close() {
  if (socket) {
    socket.close();
  }
}

// 初始化socket
initSocket();
