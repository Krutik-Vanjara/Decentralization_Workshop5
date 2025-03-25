import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import * as console from "console";
import {delay} from "../utils";


export async function node(
    nodeId: number, // the ID of the node
    N: number, // total number of nodes in the network
    F: number, // number of faulty nodes in the network
    initialValue: Value, // initial value of the node
    isFaulty: boolean, // true if the node is faulty, false otherwise
    nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
    setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let nodeState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null
  };

  let roundRMessages: Map<number, Value[]> = new Map();
  let roundPMessages: Map<number, Value[]> = new Map();

  function setNodeState(x: number, decided: boolean) {
    nodeState.x = x as Value;
    nodeState.decided = decided;
  }
  
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  node.post("/message", async (req, res) => {
    let { R, k, x } = req.body;
    if (!isFaulty && !nodeState.killed) {
      if (R === "R") {
        let roundRProcessedMessages = processMessage(roundRMessages, k, x);
        if (roundRProcessedMessages.length >= (N - F)) {
          const { countValues0, countValues1 } = countValues(roundRProcessedMessages);
          let v: Value;
          if (countValues0 > (N / 2)) {
            v = 0;
          } else if (countValues1 > (N / 2)) {
            v = 1;
          } else {
            v = Math.random() > 0.5 ? 0 : 1;
          }
          sendAllMessage("P", k, v, N);
        }
      } else if (R === "P") {
        let roundPProcessedMessages = processMessage(roundPMessages, k, x);
        if (roundPProcessedMessages.length >= N - F) {
          const { countValues0, countValues1 } = countValues(roundPProcessedMessages);
          
          // Check if we have enough messages to reach consensus
          if (roundPProcessedMessages.length >= N - F) {
            // Check if we have enough messages of the same value to reach consensus
            if (countValues0 >= F + 1) {
              setNodeState(0, true);
            } else if (countValues1 >= F + 1) {
              setNodeState(1, true);
            } else {
              // If we don't have enough, choose randomly
              nodeState.x = Math.random() > 0.5 ? 0 : 1;
              nodeState.k = k + 1;

              // Ensure nodeState.k is not null before passing it
              if (nodeState.k !== null) {
                sendAllMessage("R", nodeState.k, nodeState.x, N);
              }
            }
          }
        }
      }
      res.status(200).send("message");
    } else {
      res.status(500).send("faulty");
    }
  });


  node.get("/start", async (req, res) => {
    if (!isFaulty) {
      nodeState.decided = false;
      nodeState.x = initialValue;
      nodeState.k = 1;
      sendAllMessage("R", nodeState.k, nodeState.x, N);
    }
    res.status(200).send("started");
  });

  node.get("/stop", (req, res) => {
    nodeState.killed = true;
    res.status(200).send("stopped");
  });

  node.get("/getState", (req, res) => {
    if (isFaulty) { nodeState.x = null; nodeState.k = null; nodeState.decided = null; };
    res.status(200).send({ x: nodeState.x, k: nodeState.k, killed: nodeState.killed, decided: nodeState.decided });
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}

async function sendAllMessage(R: string, k: number, x: Value, N: number) {
  const promises = Array.from({length: N}, (_, i) => 
    fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({"R": R, "k": k, "x": x})
    })
  );
  await Promise.all(promises);
}

function processMessage(messages: Map<number, any[]>, k: number, x: any) {
  const messageArray = messages.get(k) || [];
  messageArray.push(x);
  messages.set(k, messageArray);
  return messageArray;
}

function countValues(array: any[]) {
  let countValues0 = array.filter((value) => value == 0).length;
  let countValues1 = array.filter((value) => value == 1).length;
  return { countValues0, countValues1 };
}

export async function launchNodes(
  N: number,
  F: number,
  initialValues: Value[],
  faultyList: boolean[]
) {
  console.log(`Launching Nodes: N=${N}, F=${F}`);
  console.log(`Initial Values: ${JSON.stringify(initialValues)}`);
  console.log(`Faulty List: ${JSON.stringify(faultyList)}`);

  if (initialValues.length !== faultyList.length || N !== initialValues.length) {
    throw new Error("Arrays don't match");
  }
  if (faultyList.filter((el) => el === true).length !== F) {
    throw new Error("faultyList doesn't have F faulties");
  }

  // ... rest of the code ...
}