onmessage = (e) => {
  console.log("Message received from main script");
  const workerResult = e.data;
  console.log("Posting message back to main script");
  postMessage(workerResult);
};