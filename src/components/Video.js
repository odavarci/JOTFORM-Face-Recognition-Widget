import axios from 'axios';
import * as faceapi from 'face-api.js';
import React, { useEffect, useState } from 'react';
import Wrapper from './Helper/Wrapper';

const faceFieldName = 'FACE_DATABASE';

let formDatabaseID = '230581075716052'; //Form that I store the match for forms and database forms
let widgetFormID; //Form that user interacts right now
let widgetDatabaseFormID; //Form that stores the database
let widgetQuestions, widgetDatabaseQuestions;

let jotform, jotformAPI; //Objects for managing jotform stuff
let databaseSubmissions; //Stores the submissions in the database
const basicElementTypes = ['control_fullname', 'control_email', 'control_address', 'control_phone']; //I will store those types of fields

function Video(props) {

  let formID = props.formID;
  let apiKey = props.apiKey;
  let faceRecognizorThreshold = 0.20;

  jotformAPI = window.JF;
  jotform = window.JFCustomWidget;

  //const [modelsLoaded, setModelsLoaded] = useState(false);
  const [captureVideo, setCaptureVideo] = useState(false);
  const [capturedFace, setCapturedFace] = useState(null);
  const [recognizedProfile, setRecognizedProfile] = useState(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [isRecognized, setIsRecognized] = useState(null);

  //Video properties
  const videoRef = React.useRef();
  const videoHeight = 480;
  const videoWidth = 640;
  const canvasRef = React.useRef();

  const loadModels = async () => {
    const MODEL_URL = process.env.PUBLIC_URL + '/models';

    return Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
  }

  const getSubmissions = (formID) => {
    return new Promise(function(resolve, reject){
        axios.get('https://api.jotform.com/form/' + formID + '/submissions?apiKey=' + apiKey)
        .then(function(response){
            let result = response.data.content.filter( (item) => {
                return item.status !== 'DELETED';
            });
            resolve(result);
        })
        .catch(function(error){
            reject("Submission fetch error!");
        });
    });
  }

  const getQuestions = (formID) => {
    return new Promise((resolve, reject) => {
      try {
        axios.get('https://api.jotform.com/form/' + formID + '/questions?apiKey=' + apiKey)
        .then((response) => {
          resolve(response);
        });
      }
      catch(error) {
        console.log("getQuestions Error: ", error);
        reject(error);
      }
    });
  }

  //---------------------------DATABASE FORM FUNCTIONS---------------------------------------------------------
  const getWidgetDatabaseFormID = () => {
    return new Promise(function(resolve, reject){
      try {
        let match = false;
        let submission = getSubmissions(formDatabaseID);
        submission.then((response) => {
          for(let i = 0; i < response.length; i++) {
            if(response[i].answers[4].answer === widgetFormID && response[i].answers[5].answer !== undefined) {
              match = true;
              resolve(response[i].answers[5].answer);
            }
          }
          if(!match) {
            console.log("new form created");
            let promise = createNewDatabaseForm(widgetFormID);
            promise.then((response) => {
              console.log("SUBMIT MATCH WORKED");
              submitDatabaseMatch(widgetFormID,response);
              resolve(response);
            });
          }
        });
      }
      catch(error) {
        console.log("getWidgetDatabaseFormID Error: ", error);
        reject(error);
      }
    });
  }

  const createNewDatabaseForm = (formID) => {
    return new Promise(function(resolve, reject){
      let formData = new FormData();
      formData.append('properties[title]', formID + "Database");
      axios.post('https://api.jotform.com/form?apiKey=' + apiKey, formData)
      .then(function(response){
        addQuestionsToDatabase(response.data.content.id).then( () => {
          resolve(response.data.content.id);
        });
      })
      .catch(function(error){
        console.log("createNewDatabaseForm Error: ", error);
        reject(-1);
      });
    });
  }

  const addQuestionsToDatabase = (databaseID) => {
    return new Promise(function(resolve, reject) {
      try {
        let formData = new FormData();
        formData.append('question[type]', 'control_textbox');
        formData.append('question[name]', faceFieldName);
        axios.post('https://api.jotform.com/form/' + databaseID + '/questions?apiKey=' + apiKey, formData)
        .then(function() {
          for (let i = 0; i < widgetQuestions.length; i++) {
            let formData = new FormData();
            formData.append('question[type]', widgetQuestions[i].type);
            formData.append('question[name]', widgetQuestions[i].qid);
            axios.post('https://api.jotform.com/form/' + databaseID + '/questions?apiKey=' + apiKey, formData)
            // eslint-disable-next-line no-loop-func
            .then(function() {
              if(i === widgetQuestions.length - 1) {
                resolve(1);
              }
            });
          }
        });
        
      }
      catch(error) {
        console.log("addQuestionToDatabase Error: ", error);
        reject(0);
      }
    });
  }

  const submitDatabaseMatch = (formID, databaseID) => {
    let formData = new FormData();
    formData.append('submission[4]',formID);
    formData.append('submission[5]', databaseID);
    axios.post('https://api.jotform.com/form/' + formDatabaseID + '/submissions?apiKey=' + apiKey, formData)
    .then((response) => {
      console.log("match submit return", response);
    });
  }
  //-----------------------------------------------------------------------------------------------------------

  const getSavedQuestions = (id) => {
    return new Promise(function(resolve, reject){
      try{
        axios.get('https://api.jotform.com/form/' + id + '/questions?apiKey=' + apiKey)
        .then(function(response) {
          let arr = response.data.content;
          let toReturn = [];

          for(let i in arr) {
            if(basicElementTypes.includes(arr[i].type)) {
              toReturn.push(arr[i]);
            }
          }
          resolve(toReturn);
        });
      }
      catch (error){
        console.log("getSavedQuestions Error:", error);
        reject(error);
      }
    });
  }

  const calculateSimilarityOfFaces = (face1, face2) => {
    let distance = 0;
    for(let i = 0; i < face1.length; i++){
      distance += Math.pow((face1[i] - face2[i]), 2)
    }
    return distance;
  }

  const findFace = (face) => {
    getQuestions(widgetDatabaseFormID)
    .then((response) => {
      let faceQID;

      let arr = response.data.content;
      for(let i in arr) {
        if(arr[i].name === faceFieldName) {
          faceQID = i;
        }
      }

      let match = false;
      for(let i in databaseSubmissions) {
        let answers = databaseSubmissions[i].answers;
        for(let j in answers) {
          if(j === faceQID) {
            let currentFace = answers[j].answer.split(",");
            let distance = calculateSimilarityOfFaces(currentFace, face);
            if(distance < faceRecognizorThreshold) {
              match = true;
              console.log("FOUND: ",answers);
              setRecognizedProfile(answers);
              return true;
            }
          }
        }
      }
      if(!match) {
        return false;
      }
    })
  }

  const setFieldsValue = () => {
    let name = recognizedProfile[0];
    let surname = recognizedProfile[1];
    jotform.setFieldsValueById(
      [{
        id: '3',
        value: name + ' ' + surname
      }]
    );
  }

  const creteNewFaceSubmission = () => {
    let arr = [];
    for(let i = 0; i < widgetQuestions.length; i++) {
      arr.push(widgetQuestions[i].qid);
    }
    jotform.getFieldsValueById( arr, (response) => {
        submitFace();
      });
  }

   const submitFace = (face, name, surname) => {
    let formData = new FormData();
    formData.append('submission[3]', face);
    formData.append('submission[6_first]', name);
    formData.append('submission[6_last]', surname);

    axios.post('https://api.jotform.com/form/' + widgetDatabaseFormID + '/submissions?apiKey=' + apiKey, formData)
    .then(function(response){
      console.log("Submit response", response);
    })
    .catch(function(error){
      console.log(error);
    });
  }

  //----------------------------------------WEBCAM FUNCTIONS--------------------------------------------------------
  const startVideo = () => {
    setCaptureVideo(true);
    navigator.mediaDevices
      .getUserMedia({ video: { width: 300 } })
      .then(stream => {
        let video = videoRef.current;
        video.srcObject = stream;
        video.play();
      })
      .catch(err => {
        console.error("error:", err);
      });
  }

  const handleVideoOnPlay = () => {
    let timesRecognitionLeft = 10;
    const videoInterval = setInterval(async () => {
      if (canvasRef && canvasRef.current) {
        canvasRef.current.innerHTML = faceapi.createCanvasFromMedia(videoRef.current);
        const displaySize = {
          width: videoWidth,
          height: videoHeight
        }

        faceapi.matchDimensions(canvasRef.current, displaySize);

        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions().withFaceDescriptor();
        if(detection !== undefined) {
          timesRecognitionLeft--;

          if(findFace(detection.descriptor)){
            closeWebcam();
            clearInterval(videoInterval);
            return;
          }
  
          canvasRef && canvasRef.current && canvasRef.current.getContext('2d').clearRect(0, 0, videoWidth, videoHeight);
          canvasRef && canvasRef.current && faceapi.draw.drawDetections(canvasRef.current, detection);
          canvasRef && canvasRef.current && faceapi.draw.drawFaceLandmarks(canvasRef.current, detection);
          canvasRef && canvasRef.current && faceapi.draw.drawFaceExpressions(canvasRef.current, detection);
        }
        if(timesRecognitionLeft === 0 && recognizedProfile === null){
          closeWebcam();
          clearInterval(videoInterval);
          setIsRecognized(false);
          setCapturedFace(detection.descriptor);
        }

      }
    }, 100)
  }

  const closeWebcam = () => {
    videoRef.current.pause();
    videoRef.current.srcObject.getTracks()[0].stop();
    setCaptureVideo(false);
  }
  //------------------------------------------------------------------------------------------------------------------

  const init = () => {
    if(!widgetLoaded) {
      jotform.subscribe("ready", (response) => {
        //WIDGET FORM ID
        widgetFormID = response.formID;
        //QUESTIONS OF WIDGET FORM
        let promiseQuestions = getSavedQuestions(widgetFormID);
        promiseQuestions.then( (response) => {
          widgetQuestions = response;
          //DATABASE FORM ID
          let promiseDatabase = getWidgetDatabaseFormID();
          promiseDatabase.then( (response) => {
            widgetDatabaseFormID = response;
            //DATABSE SUBMISSIONS
            let promiseSubmission = getSubmissions(widgetDatabaseFormID);
              promiseSubmission.then( (response) => {
              databaseSubmissions = response;
              //LOAD FACE API MODELS
              loadModels().then(() => {
                setWidgetLoaded(true);
              });
            });
          });
        });
      });
    }
  }

  const returnFaceInfo = () => {
    // if(isRecognized === false){
    //   return(
    //     <Wrapper>
    //       <p>Face not found. Please fill the form.</p>
    //       <button onClick={creteNewFaceSubmission}>Done!</button>
    //     </Wrapper>
    //   );  
    // }
    // else{
    //   setFieldsValue();
    //   return (
    //     <p>{recognizedProfile[0] + " " + recognizedProfile[1]}</p>
    //   );
    // }
    return(
      <Wrapper>
        <p>Face not found. Please fill the form.</p>
        <button onClick={creteNewFaceSubmission}>Done!</button>
      </Wrapper>
    );
  }

  init();

  return (
    <Wrapper>
        {widgetLoaded ?
            <Wrapper>
            {
              (recognizedProfile === null && isRecognized === null) ? 
                <div>
                  {
                    !captureVideo ?
                      startVideo()
                      :
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                          <video ref={videoRef} height={videoHeight} width={videoWidth} onPlay={handleVideoOnPlay} style={{ borderRadius: '10px' }} />
                          <canvas ref={canvasRef} style={{ position: 'absolute' }} />
                        </div>
                      </div>
                  }
                </div>
                :
                returnFaceInfo()
            }
          </Wrapper>
          :
          <h1>widget loading...</h1>
        }
    </Wrapper>
  );
}
export default Video;