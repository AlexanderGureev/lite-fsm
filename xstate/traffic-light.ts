/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { setup } from "xstate";

const machine = setup({
  types: {
    events: {} as { type: "NEXT" } | { type: "PEDESTRIAN_REQUEST" } | { type: "EMERGENCY" } | { type: "RESET" },
  },
}).createMachine({
  id: "trafficLight",
  initial: "green",
  states: {
    green: {
      after: { 5000: { target: "yellow" } },
      on: {
        NEXT: { target: "yellow" },
        EMERGENCY: { target: "red.flash" },
      },
    },
    yellow: {
      after: { 2000: { target: "red" } },
      on: {
        NEXT: { target: "red" },
        EMERGENCY: { target: "red.flash" },
      },
    },
    red: {
      initial: "waiting",
      on: {
        EMERGENCY: { target: ".flash" },
      },
      states: {
        waiting: {
          on: {
            PEDESTRIAN_REQUEST: { target: "pedestrianCrossing" },
          },
          after: { 3000: { target: "turnArrow" } },
        },
        pedestrianCrossing: {
          after: { 4000: { target: "turnArrow" } },
        },
        turnArrow: {
          after: { 3000: { target: "clearance" } },
        },
        clearance: {
          after: { 1000: { target: "#trafficLight.green" } },
        },
        flash: {
          on: {
            RESET: { target: "#trafficLight.green" },
          },
        },
      },
    },
  },
});
