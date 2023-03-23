import axios from 'axios';
import * as faceapi from 'face-api.js';
import React, { useRef, useState } from 'react';
import Wrapper from './Helper/Wrapper';

const faceFieldName = 'FACE_DATABASE';
const faceRecognizorThreshold = 0.20;

let formDatabaseID = '230581075716052'; //Form that I store the match for forms and database forms
let widgetFormID; //Form that user interacts right now
let widgetDatabaseFormID; //Form that stores the database
let widgetQuestions, widgetDatabaseQuestions;

let jotform;             //Objects for managing jotform stuff
let databaseSubmissions; //Stores the submissions in the database
const basicElementTypes = ['control_fullname', 'control_email', 'control_phone', 'control_address']; //I will store those types of fields

function Video(props) {

  let apiKey = props.apiKey;

  //jotformAPI = window.JF;
  jotform = window.JFCustomWidget;

  //States
  const [captureVideo, setCaptureVideo] = useState(false);
  const [capturedFace, setCapturedFace] = useState(null);
  const [recognizedProfile, setRecognizedProfile] = useState(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [isRecognized, setIsRecognized] = useState(null);

  //Video properties
  const videoRef = useRef();
  const videoHeight = 240;
  const videoWidth = 320;
  const canvasRef = useRef();
  const willBeSaved = useRef(true);

  //-----------------------------------------CALLBACK FUNCTIONS-------------------------------------------------------------
  const basicCallbackFunction = () => {
    var result = {};
    result.valid = true;
    result.value = "submit";
    jotform.sendSubmit(result);
  }

  const recognizedCallbackFunction = () => {
    getFieldsValue()
    .then((response) => {
      for(let i = 0; i < response.length; i++) {
        if(response[i].value !== recognizedProfile[i + 2].prettyFormat) {
          createNewFaceSubmission(recognizedProfile[1].answer);
          break;
        } 
      }
    });
    //basicCallbackFunction();
  }

  const notRecognizedCallbackFunction = () => {
    createNewFaceSubmission(capturedFace);
    //basicCallbackFunction();
  }

  const changeSavedStatus = () => {
    if(willBeSaved.current) {
      jotform.subscribe("submit", basicCallbackFunction);  
    }
    else {
      jotform.subscribe("submit", notRecognizedCallbackFunction);
    }
    willBeSaved.current = !willBeSaved.current;
  }
  //----------------------------------------------------------------------------------------------------------

  //-----------------------------------------DATABASE FORM FUNCTIONS---------------------------------------------------------
  const getWidgetDatabaseFormID = () => {
    return new Promise(function(resolve, reject){
      let match = false;
      let submission = getSubmissions(formDatabaseID);
      submission.then((response) => {
        for(let i = 0; i < response.length; i++) {
          if(response[i].answers[4].answer === widgetFormID && response[i].answers[5].answer !== "undefined") {
            match = true;
            resolve(response[i].answers[5].answer);
            return;
          }
        }
        //Create new database form and return its id
        if(!match) {
          console.log("new form created");
          let promise = createNewDatabaseForm(widgetFormID);
          promise.then((response) => {
            if(response === "-1") {
              getWidgetDatabaseFormID()
              .then((response) => {
                resolve(response);
              });
            }
            else {
              submitDatabaseMatch(widgetFormID, response);
              resolve(response);
            }
          });
        }
      });
    });
  }

  const createNewDatabaseForm = (formID) => {
    return new Promise(function(resolve, reject){
      let formData = new FormData();
      formData.append('properties[title]', formID + "Database");
      formData.append('questions[0][type]', 'control_textbox');
      formData.append('questions[0][name]', faceFieldName);
      formData.append('questions[0][order]', '0');
      let questions = getSavedQuestions();
      for(let i = 0; i < questions.length; i++) {
        formData.append('questions[' + (i+1) + '][type]', questions[i].type.toString());
        formData.append('questions[' + (i+1) + '][name]', questions[i].qid.toString());
        //formData.append('questions[' + (i+1) + '][order]', (i + 1).toString());
        formData.append('questions[' + (i+1) + '][order]', '0');
      }
      axios.post('https://api.jotform.com/form?apiKey=' + apiKey, formData)
      .then(function(response){
        let newID = response.data.content.id;
        if(newID === undefined) {
          let garbageFormID = response.data.content.split(" ")[1];
          axios.delete("https://api.jotform.com/form/" + garbageFormID + "?apiKey=" + apiKey)
          .then(() => {
          });
          resolve("-1");
        }
        else {
          resolve(newID);
        }
      })
    });
  }

  const submitDatabaseMatch = (formID, databaseID) => {
    let formData = new FormData();
    formData.append('submission[4]',formID);
    formData.append('submission[5]', databaseID);
    axios.post('https://api.jotform.com/form/' + formDatabaseID + '/submissions?apiKey=' + apiKey, formData)
    .then((response) => {
    });
  }
  //-----------------------------------------------------------------------------------------------------------

  //------------------------------------------FORM FUNCTIONS------------------------------------------------------------------
  const getSubmissions = (formID) => {
    return new Promise(function(resolve, reject){
        let filter = {"status:eq": "ACTIVE"};
        let params = { params: { "limit": 1000, "filter": JSON.stringify(filter) } };
        axios.get('https://api.jotform.com/form/' + formID + '/submissions?apiKey=' + apiKey, params)
        .then(function(response){
          resolve(response.data.content);
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
          resolve(response.data.content);
        });
      }
      catch(error) {
        console.log("getQuestions Error: ", error);
        reject(error);
      }
    });
  }

  const getSavedQuestions = () => {
    let toReturn = [];
    for(let i in widgetQuestions) {
      if(basicElementTypes.includes(widgetQuestions[i].type)) {
        toReturn.push(widgetQuestions[i]);
      }
    }
    return toReturn;
  }

  const setFieldsValue = () => {
    let arr = [];
    for(let i in recognizedProfile) {
      if(i === 1) {   //it is face descriptor
        continue;
      }
      let id = recognizedProfile[i].name;
      let value = (recognizedProfile[i].prettyFormat !== undefined) ? recognizedProfile[i].prettyFormat : recognizedProfile[i].answer;
      arr.push({
        id: id,
        value: value
      });
    }

    jotform.setFieldsValueById(arr);
  }

  const getFieldsValue = () => {
    return new Promise((resolve, reject) => {
      let arr = [];
      let questions = getSavedQuestions();
      for(let i = 0; i < questions.length; i++) {
        arr.push(questions[i].qid);
      }
      jotform.getFieldsValueById( arr, (response) => {
          console.log("fields:", response.data);
          resolve(response.data);
        });
    });
  }
  //----------------------------------------------------------------------------------------------------------

  //-----------------------------------------FACE FUNCTIONS-----------------------------------------------------
  const calculateSimilarityOfFaces = (face1, face2) => {
    let distance = 0;
    for(let i = 0; i < face1.length; i++){
      distance += Math.pow((face1[i] - face2[i]), 2)
    }
    return distance;
  }

  const findFace = (face) => {
    let faceQID;

    for(let i in widgetDatabaseQuestions) {
      if(widgetDatabaseQuestions[i].name === faceFieldName) {
        faceQID = i;
      }
    }

    for(let i in databaseSubmissions) {
      let answers = databaseSubmissions[i].answers;
      for(let j in answers) {
        if(j === faceQID) {
          let currentFace = answers[j].answer.split(",");
          let distance = calculateSimilarityOfFaces(currentFace, face);
          if(distance < faceRecognizorThreshold) {
            //closeWebcam();
            console.log("recognized profile: ", answers);
            setRecognizedProfile(answers);
            return true;
          }
        }
      }
    }
    return false;
  }

  const createNewFaceSubmission = (face) => {
    getFieldsValue()
    .then((response) => {
      submitFace(response, face);
    });
  }

   const submitFace = (values, face) => {
    console.log("values:", values);
    let formData = new FormData();
    for(let i = 0; i < values.length; i++) {
      let qid = i + 2;
      if(values[i].type === 'control_fullname') {
        let arr = values[i].value.split(" ");
        formData.append("submission[" + qid + "_first]", arr[0]);
        formData.append("submission[" + qid + "_last]", arr[1]);
      }
      else if(values[i].type === 'control_phone') {
        let arr = values[i].value.split(" ");
        formData.append("submission[" + qid + "_area]", arr[0].substring(1,4));
        formData.append("submission[" + qid + "_phone]", arr[1]);
      }
      else if(values[i].type === 'control_email') {
        formData.append("submission[" + qid + "]", values[i].value);
      }
    }
    formData.append("submission[1]", face.toString());

    axios.post('https://api.jotform.com/form/' + widgetDatabaseFormID + '/submissions?apiKey=' + apiKey, formData)
    .then(function(response){})
    .catch(function(error){
      console.log(error);
    });
  }
  //------------------------------------------------------------------------------------------------------------

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
          
          const resizedDetection = faceapi.resizeResults(detection, displaySize);
          if(findFace(detection.descriptor)) {
            closeWebcam();
            clearInterval(videoInterval);
          }
  
          canvasRef && canvasRef.current && canvasRef.current.getContext('2d').clearRect(0, 0, videoWidth, videoHeight);
          canvasRef && canvasRef.current && faceapi.draw.drawDetections(canvasRef.current, resizedDetection);
          canvasRef && canvasRef.current && faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetection);
          canvasRef && canvasRef.current && faceapi.draw.drawFaceExpressions(canvasRef.current, resizedDetection);
        }
        if(timesRecognitionLeft === 0) {
          closeWebcam();
          clearInterval(videoInterval);
          setIsRecognized(false);
          setCapturedFace(detection.descriptor);
          console.log("Not Found:", recognizedProfile);
        }
      }
    }, 100);
  }

  const closeWebcam = () => {
    videoRef.current.pause();
    videoRef.current.srcObject.getTracks()[0].stop();
    setCaptureVideo(false);
  }
  //------------------------------------------------------------------------------------------------------------------

  //--------------------------------------INITILIZATION FUNCTIONS-----------------------------------------------------
  const init = () => {
    if(!widgetLoaded) {
      jotform.subscribe("ready", (response) => {
        console.log(jotform);
        console.log("Settings: ", jotform.getWidgetSettings().toString());
        console.log("Setting: ", jotform.getWidgetSetting("Question IDs:") === "");
        if(jotform.isWidgetOnBuilder()) {
          setWidgetLoaded(true);
        }
        else{
          //WIDGET FORM ID
          widgetFormID = response.formID;

          //QUESTIONS OF WIDGET FORM
          getQuestions(widgetFormID)
          .then((response) => {
            widgetQuestions = response;
            console.log("Widget Questions:", widgetQuestions);

            //DATABASE FORM ID
            getWidgetDatabaseFormID()
            .then((response) => {
              widgetDatabaseFormID = response;
              console.log("database id:", widgetDatabaseFormID);
              
              //DATABASE QUESTIONS
              getQuestions(widgetDatabaseFormID)
              .then((response) => {
                widgetDatabaseQuestions = response;

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
      });
    }
  }

  const loadModels = async () => {
    const MODEL_URL = process.env.PUBLIC_URL + '/models';

    return Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
  }
  //-------------------------------------------------------------------------------------------------------------------

  const returnFaceInfo = () => {
    if(isRecognized === false){
      jotform.subscribe("submit", notRecognizedCallbackFunction);
      return(
        <label style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
          <input type="checkbox" onClick={changeSavedStatus}/>
          I do not want to be recognized later!
        </label>
      );
    }
    else{
      setFieldsValue();
      jotform.subscribe("submit", recognizedCallbackFunction);
      //return();
    }
  }

  init();

  return (
    <Wrapper>
        {jotform.isWidgetOnBuilder() ?
          <h1>I am not working on builder :(</h1>
          :
          widgetLoaded ?
            <Wrapper>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                <video ref={videoRef} height={videoHeight} width={videoWidth} onPlay={handleVideoOnPlay} style={{ borderRadius: '10px' }} />
                <canvas ref={canvasRef} style={{ position: 'absolute' }} />
              </div>
              {
                (recognizedProfile === null && isRecognized === null) ? 
                  <Wrapper>
                    {
                      !captureVideo ?
                      startVideo()
                      :
                      <></>
                    }
                  </Wrapper>
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