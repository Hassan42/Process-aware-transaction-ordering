const fs = require('fs');


const buyers = ["buyer1","buyer2","buyer3"];

let eventLog = [];

const shuffle = (array) => { 
    for (let i = array.length - 1; i > 0; i--) { 
      const j = Math.floor(Math.random() * (i + 1)); 
      [array[i], array[j]] = [array[j], array[i]]; 
    } 
    return array; 
  };

for (let i = 0; i < 250; i++) {

    const isDelay = Math.round(Math.random());
    let event = [...shuffle(buyers)];
    event.push(isDelay)
    eventLog.push(event)
}

const eventLogJSON = JSON.stringify(eventLog);
fs.writeFileSync('eventLog.json', eventLogJSON);
