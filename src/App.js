import * as faceapi from 'face-api.js';
import React, { useState } from 'react';
import Video from './components/Video';
import Demo from './components/Demo';

let formID = '230253108680045';
let apiKey = '773509ca899decb51f9308626699cf5f';

function App() {
  const jotform = window.JFCustomWidget;
  // console.log(jotform);
  // jotform.subscribe("ready", (form) => {
  //   const getQuestions = async () => {
  //     try {
  //       const {data} = await getFormQuestions(form.formID)
  //       setWidgetFormFields(setQuestionsArray(data.content, submissionLabels))
  //     } catch (error) {
  //       console.log(error)
  //     }
  //   }
  //   getQuestions();
  // });

  return(
    <Video apiKey={apiKey} formID={formID}/>
  );
}

// function App() {
//   return(
//     <Demo/>
//   );
// }

export default App;