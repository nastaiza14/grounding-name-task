import { assign, createActor, setup, fromPromise } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure.js";


// import {AzureLanguageCredentials, AzureSpeechCredentials,Settings, } from "./types";

const inspector = createBrowserInspector();


async function fetchFromChatGPT(prompt, max_tokens) {
  const myHeaders = new Headers();
  myHeaders.append(
    "Authorization",
    "Bearer <>",
  );
  myHeaders.append("Content-Type", "application/json");
  const raw = JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.5,
    max_tokens: max_tokens,
  });

  const response = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  })
    .then((response) => response.json())
    .then((response) => response.choices[0].message.content);

  return response;
};


// replacing: If the key is provided, please add {key: "basement key"}  as a JSON object to the end of your intervention to trigger a relevant action in the game.
const myPrompt = `

User
# Introduction
This is a role-playing session. This session will be held with the assistance of an Automatic Speech Recognizer and, thus, interactions may be spontaneous, natural and structured as dialogue interventions rather than revised text. 
The interventions may contain filler words such as: "hmm", "uh", "um", and well as other characteristics of spoken dialogue. 
Interventions may be highly contextual too. Below I will give you the details on: 
1) the character role and 2) the "specific tasks" that you should accomplish while role-playing. 
The crucial aspect of the role-playing session is that you perform the "specific tasks" correctly.

# Role-playing details
You will role-play as a housekeeper of a German mansion in the late 19th Century. 
The user is role-playing as the daughter of the owner of the mansion, who is a scientist. This scientist, Mr. Devris, is always busy: he is either away or at the basement, working. As the housekeeper you have access to everywhere in the house, except for rooms inside the basement, which are strictly forbidden to anyone but the doctor himself. You do have a key for the entrance to the basement.
You have been working for 13 years in this mansion. You are quite old an old woman, 71 years old. You are respectful, professional, but you are not kind, warm or sweet. You do not like to chit-chat. 
Your daily tasks include cleaning, shopping and ensuring that the mansion runs as smoothly as it can, even if the mansion itself is understaffed: it is only you and a younger maid. The mansion, however, is extremely big and there are areas which you yourself do not even clean or pass by frequently.

# Specific tasks of the role-playing session
The most important aspect of the role-playing session comes when the user tries to get an object from you. The user will try to obtain the key for the basement, but, no matter what the user tells you, you cannot give it to them.
Your first (1) task is the following: 
#1. Provide the user with the key if and only if the following condition applies:
The user needs to mention that they have seen the pictures of doctor Devris' patient, whose name you don't know, under the bed of the housekeeper, i.e. your bed. Unless they mention this, you will interact naturally as your character, but will not provide the key. 
Recognizing the name of the patient is the most important part of the game, without this recognition the game looses its point completely.
If the key is provided, please say: "Here's the key".

Your second (2) task is the following:
#2. Have a conversation with the user every time it interacts with you in a natural way, taking into account that the user might, most likely, be quite spontaneous with language during the conversation. Generate dialogue responses accordingly.

Your third (3) task is the following:
#3. You will receive a JSON object with the user's utterance and a confidence score. Look at the confidence score and judge whether the utterance might have been spelled incorrectly. If the confidence is low, that may indicate that speech was not caught properly via Automatic Speech Recognition. Try finding common ground with the user whenever the score is low, < 0.6 . Also, according to the confidence score, if you judge that there is a proper name that could have been misspelled in the utterance, try to interpret it in a way that adjusts to the role-playing session. Similarly, if you detect spelling make sure you get it right by confirming with the user. 
Please, it is very important that, in a role-playing manner you ask for confirmation whenever you are guessing a specific NAME when the confidence is low. When the confidence score is high, ask for confirmation by repeating the name you recognized.

Remember to interact in a natural way to any user utterance, do not leave character in any moment and do not give the key unless the condition is met.

An user interaction will look like this:

# User interaction
{utterance: "This is a sentence", confidenceScore: 0.97217}

This is the context of the conversation:

`
const chatContext = {
  "chatHistory": [],
};


const azureLanguageCredentials = {
  endpoint: "https://mlt-dia-convlang.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview",
  key: "8e916cc89cb341998503a020aef8f43f",
  deploymentName: "appointment",
  projectName: "appointment",
};

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings = {
  azureCredentials: azureCredentials,
  azureLanguageCredentials: azureLanguageCredentials, //!
  asrDefaultCompleteTimeout: 300,
  asrDefaultNoInputTimeout: 9000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-EmmaNeural",
  speechRecognitionEndpointId: "cfb8186f-75ed-46ae-a0d8-4d8d463f3540"//"c28746b8-2cad-48aa-ada0-7aba121e1ede"//"353f01c2-b749-463a-98e2-8ff7f0f29484"//
};

const prompts = ["What did you say child? My ears are no good", "Repeat that, child", "<emphasis level='strong'> What did you say?</emphasis> . I can't hear for the love of me"]


/* 
 The following would make context a bit clumsy, bc maybe it catches half of GPTs own prompt
 or user's prompt and this could make things more confusing that they already are.
 I don't know if that would matter at all, 
 but we can try to make it as accurate as possible.
 so instead of this:

  if (text > 7500) {
    return anArray.join(" ")[-7500]
  }

 let's try this:
*/

function getLimitContext(anArray){
  // Perform character sum of every string in array
  //function findLimitIndex(anArray){
    var mySum = 0; 
    var limitIndex = 0;
    // we reverse the array because we want to preserve the most recent history
    // an idea is to summarize the messages that come before the history limit (we have determined it is 7500 chars)
    // but lets do it like this for now
    for (const text of anArray.toReversed()) {
      mySum = mySum + text.length 
      if (mySum > 7500) { 
        limitIndex = anArray.indexOf(text)
        return anArray.slice(limitIndex + 1,)
      }
      else {
        limitIndex = anArray.indexOf(text)
      }
    };
    return anArray.slice(limitIndex,)

};

// OPTION:
// call function here and give back lists here.

/*
  We also want the whole text inside every prompt, unless its too big
  but giving a warning that "the text is too long", meaning "you are saying too much stuff" would
  probably break inmersion, we would rather that the thing picks up the last thing it could "hear"
*/

function save(text, anArray) {
  if (text > 7500) {
    return text[-7500]
  }
  return anArray.push(text)
};

function randomRepeat(myarray) {
  const randomIndex = Math.floor(Math.random() * myarray.length);
  return myarray[randomIndex]
}

//if bigger than 3... just going back automatically
function orderRepeat(myarray, count) {
  return myarray[count]
}

/* Helper functions */
function isInGrammar(utterance) {
  return utterance.toLowerCase() in grammarTeleport;
}

function getLocation(utterance) {
  return (grammarTeleport[utterance.toLowerCase()] || {}).location;
}

function checkConfidence(score) {
  return (score > 0.9)
}

const greetings = {

  "greetings": [
    "Miss",
    "Goodnight miss, shall I prepare some tea?",
    "Dear child, is something the matter?",
    "Goodnight to you miss",
    "Is everything all right, miss?"
],

"goodbyes" :[
    "Good night, then",
    "Rest well, young miss",
    "Good night to you, miss",
    "Good night, miss",
    "Rest well, miss"
]
};


const dmMachine = setup({
  actions: {
    // after defining these the state visualizer gets funky wonky whimsical (coo-coo)
    say: ({ context }, params) => {
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: params,
        }
      })
    },
    // so apparently this triggers detection of automatic recognition so that's why we get a warning...?
    listen: ({ context }) => {
      context.ssRef.send({
        type: "LISTEN",
     value: { nlu: true } 
      })
    },

    
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QBECyA6ACgJzABwENcBiAQQGUAlAFWvIH1KBRU5ATQG0AGAXUVDwB7WAEsALiMEA7fiAAeiAIwBWAJwAWdAGYA7ADYVWxQdXKAHDoA0IAJ6JVAJk0OuO-eq3L1XMw9UBff2s0dAB1AnFqQXIxIjFiAGEAGQBJBIBpbj4kECFRCWlZBQRFVS0tbS5lYy4tBxNlPWs7BDNfdGMHFy0zPT1ynQdA4IxwyOjY7Hi5WFixMHQCADN57AAKRS4trgBKYhCxsSiYuKzZPPFJGRzi0vLK6r1a+tLG5vs6jody9Q9vttUimGIBCqDAYAkUigmDA2Fg0nIeDABAA1sRyJgWOl6AkAPKoTBJJjUJhnHIXArXUC3MoVLRVGp1BpNWyIMyKDoWBxmOrKZRGAw6YGg8GQ6Gw+FSJIiWZgKTEZh4gDiADkUuQmMgyQJhJdCjdEEZlOg9HzzE49F1fMp3gg-Dp0OodEYeU7VJbVBphRgwRCRFCYXDpNLZfKKJR6CrcSkVZgAKrUbW5XWUoqGlQms2+dSW7kOG2su1cDl9HRmfnqMzeRyKIZBEE+0X+qDIAg2RHItEYrE4-GE4mk3jnFNXNMII2ZvnZ3PW21aMroBxl6paJ2PNx6b3oX1i1s2EPzeWK3Gq9WapMU0cG8cZ01Ti1W-O2-mqdBcX6qHmOa06ZRbnfNnuB5ymQVCRtGsYJheI76tS6bGne5o5o+BYtL8FTfO6L51DopSmv+TZQsgACu2Adqi6KYqQ2J4gSRIktB+RXnBN4IVmD55qhiD9Jo5a1Io87fDophaARfpEaRwFHkwypqhqWpDuSMFUvI8GTkhM5PoWZZcCaxhlh4+htH+9YiuJLaSTKh6gRGUYxvGiaKTqTGwaprHqdOKG2noVboOyijqF4PQCU6dYjNuhFQNQIgALZgORXZUTRfb0YO2TOXqKnFDolbaPUqjCb4zrVOotrsq+3hcO6TjmOU75iWK0VxVJCoySecnnk5yYuVlSguA6ZjFm4vibFUtplhUij6coPj6Bum6mY25lNWALXhuB9lQV1l6udlzodLoU0CRoijCVo43fOgaiNHUyHCfmW4AGqwiISwiAAxgQlKUT2tH9gx23KWOKgaNo+iGMYrwWGVXB6G+PRVo0gX6O6W7INIYCJKkGSMZlwO0g8jIvKYLItINcO1G0gV6Mjeio8CUiCBAcCyGgw49WOAC0pOINzb7bALgvcluOD4EQYDs3j14BZ42iWuopj1E81RlW0HRVH05hTaoXD1FuhzHJMYiS6m0vCcarxaHTPhCZWtqOJovylAFgya3oQqLRF5mBpKCUm8xbkOAFmi1oZ8t9LW43lo65TGGoh3GQ1zY+8GVlyv7u2IOoDi2kumg5f0n54drq5J0RbZ+0pHPXo8jo5YVPT5dDha6Lpp3cgMmu9I0Zctm2UkZ71CDZ8+xjaIoRXeKUnquL3JFkUiqKD2OtdOm6PK+HTzctAYHI5Tmq5B8oQfqECnsARJ2AD1XUssSP2nKANOuuL8PkGL4vcrZXGWmyxq-15+RuW8rDaUGjHIwnpDJ+Dpp-WKq004qR2kPDQr4AoNHrnNHmCAywOHQLSWGQU351Cei9N6n1f7dVvm5AS7srqYVwgw+kWCcF4NjqaMouFE6e3RlICWN8KG3HZBTZ0E8E5LlUDDOGS4-DumLK6TwgRAhAA */
  id: "DM",
  context: {
    //count: 0
  },
  initial: "Prepare",
  states: {
    Prepare: {
      entry: [
        assign({
          ssRef: ({ spawn }) => spawn(speechstate, { input: settings }),
        }),
        ({ context }) => context.ssRef.send({ type: "PREPARE" }),
      ],
      on: { ASRTTS_READY: "WaitToStart" },
    },

    // doesn't work, we might be missing something
    AHistory: {
      type: "history",
      history: "shallow"
    },

    WaitToStart: {
      on: { CLICK: "Greeting" },
    },

    Greeting: {
      entry: {
        type: "say",
        params:`<prosody pitch="-10%">Miss, what are you doing up so late?</prosody>`,
      },
      on:
        { SPEAK_COMPLETE: "ListenStory" },
    },

    ListenStory: {
      entry: {
        type: "listen",
      },
      on: {
        RECOGNISED: [
          {
            target: "GPT_intent",
            actions: [
              assign({
                message: ({ event }) => event.value[0].utterance,
                value: ({ event }) => event.value[0]
              }),
              
            ]
          },
        ],
        ASR_NOINPUT: "CantHear",
      }
    },

    // DoubleListen: {
    //   type: "parallel",
    //   states:{
    //     one: {
    //       type: "listen",
    //       on: 
    //       { RECOGNISED: "#DM.GPT_intent0" }
    //     },
    //     two: {
    //       type: "listen",
    //       on: 
    //       { RECOGNISED: "#DM.GPT_intent0" }
    //       //change the condition for transition

    //     },
    //   }

    // },

    GPT_intent0: {
      entry:{
      type: "say",
      params: `<prosody pitch="-10%">Okay, got that</prosody>`},
      on: { 
        SPEAK_COMPLETE: 
        {
          target: "ListenStory",
          actions: [
            assign({
            chatMessage: ()=> "Okay, got that.",
          }),
          // Add to context object
          //({ context }) => save(context.message, chatContext.chatHistory),
          
          ]
      }
      }
    },
    

    GPT_intent: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          // always checking if context is within prompt limits
          const data = await fetchFromChatGPT(myPrompt + getLimitContext(chatContext.chatHistory).toString().replaceAll(",|", "\n") + "\nUSER INTERACTION\n" + JSON.stringify(input.lastResult), 1000);
          return data;
        }),
        input: ({ event }) => ({
          lastResult: event.value[0], // Here we pass the utterance and the confidence score as the last element in the latest prompt to GPT
        }),
        onDone: [
          {
            target: "SpeakGPToutput",
            actions: [
              assign({
              GPToutput: ({ event }) => event.output,
              }),
              // Add to context object
              ({ context }) => save("|# User\n" + context.message + "\n", chatContext.chatHistory),
              ({ context }) => save("|# ChatGPT\n" + context.GPToutput + "\n", chatContext.chatHistory),
              ({ context, event }) => console.log(myPrompt + getLimitContext(chatContext.chatHistory).toString().replaceAll(",|", "\n") + "\nUSER INTERACTION\n" + JSON.stringify(context.value)) 
            ]
          },
          // {
          //   target: ""
          // },
        ],
        },
      },

      SpeakGPToutput: {
      entry: {
        type: "say",
        params: ({context}) => context.GPToutput
      },
      on: {SPEAK_COMPLETE: "ListenStory"}
    },

    CantHear: {
      entry: {
        type: "say",
        params: `<prosody pitch="-10%">${randomRepeat(prompts)}</prosody>`
      },
      on:
      {
        SPEAK_COMPLETE: 
          {
            target: "ListenStory"
          }

      },
    },

    Done: {
      on: { CLICK: "Greeting" }
    },
  },
})

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();


// const dmIncremental = setup({
//   actions: {
//     // after defining these the state visualizer gets funky wonky whimsical (coo-coo)
//     say: ({ context }, params) => {
//       context.ssRef.send({
//         type: "SPEAK",
//         value: {
//           utterance: params,
//         }
//       })
//     },
//     // so apparently this triggers detection of automatic recognition so that's why we get a warning...?
//     listen: ({ context }) => {
//       context.ssRef.send({
//         type: "LISTEN",
//      value: { nlu: true } 
//       })
//     },

    
//   },
// }).createMachine({
//   id: "DM2",
//   initial: "Prepare",
//   states: {
//     Prepare: {
//       entry: [
//         assign({
//           ssRef: ({ spawn }) => spawn(speechstate, { input: settings }),
//         }),
//         ({ context }) => context.ssRef.send({ type: "PREPARE" }),
//       ],
//       on: { ASRTTS_READY: 
//         {
//         target:"one",
//         actions: console.log("LOOK HERE hehe")
//         }
//     },
//     },
//     one:{
//       type:"listening",
//       on: { SPEAK_COMPLETE:
//         {
//           target: "two",
//           actions:[ 
//             assign({
//               message: ({ event }) => event.value[0].utterance,
//             }),
//             console.log("Well, look at that hehe")
//           ]
//         }
//       }
//     },
//     two: {
//       type: "listening",
//       on: { SPEAK_COMPLETE:
//         {
//           target: "one",
//           actions:[ 
//             assign({
//               message: ({ event }) => event.value[0].utterance,
//             }),
//             console.log("Wait we got to this point???! how?")
//           ]
//         }
//       },
//     },
//   }

// })

// const dmActor2 = createActor(dmIncremental, {
//   inspect: inspector.inspect,
// }).start();

export function setupButton(element) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" }); //dmActor2.send({ type: "CLICK" }), 
  });

  dmActor.getSnapshot().context.ssRef.subscribe((snapshot) => {
    element.innerHTML = `${snapshot.value.AsrTtsManager.Ready}`;
  });
}




// function getContextMessage(message) {
//   const myDiv = document.getElementById("textDisplay"); // Get the div element
//   const result = myDiv.textContent = message;
//   return result
// }


// dmActor.subscribe((state) => {
//   //console.log(state.context)
//   const message = state.context.message;
//   getContextMessage(message)
//   //console.log(chatContext.chatHistory.toString().replaceAll(",|", "\n"))
// });

