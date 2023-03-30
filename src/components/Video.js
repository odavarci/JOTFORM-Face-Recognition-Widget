import axios from 'axios';
import * as faceapi from 'face-api.js';
import React, { useRef, useState } from 'react';
import Wrapper from './Helper/Wrapper';
import cameraDisabledImage from '../images/cameraDisabled.jpg';

const faceFieldName = 'FACE_DATABASE';
const faceRecognizorThreshold = 0.20;

let formDatabaseID = '230581075716052'; //Form that I store the match for forms and database forms
let widgetFormID; //Form that user interacts right now
let widgetDatabaseFormID; //Form that stores the database
let widgetQuestions, widgetDatabaseQuestions;

let jotform;             //Objects for managing jotform stuff
let databaseSubmissions; //Stores the submissions in the database
const basicElementTypes = ['control_fullname', 'control_email', 'control_phone']; //I will store those types of fields

function Video(props) {

  let apiKey = props.apiKey;
  jotform = window.JFCustomWidget;

  //States
  const [captureVideo, setCaptureVideo] = useState(false);
  const [capturedFace, setCapturedFace] = useState(null);
  const [recognizedProfile, setRecognizedProfile] = useState(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [isRecognized, setIsRecognized] = useState(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(null);
  const [isScanStarted, setIsScanStarted] = useState(false);

  //Video properties
  const videoRef = useRef();
  const videoHeight = 240;
  const videoWidth = 320;
  const canvasRef = useRef();
  const willBeSaved = useRef(false);

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
  const getWidgetDatabaseFormID = async () => {
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
      formData.append('question[0][text]', 'face');
      let questions = getSavedQuestions();
      for(let i = 0; i < questions.length; i++) {
        formData.append('questions[' + (i+1) + '][type]', 'control_textbox');
        formData.append('questions[' + (i+1) + '][name]', questions[i].qid.toString());
        formData.append('questions[' + (i+1) + '][order]', '0');
        formData.append('questions[' + (i+1) + '][text]', questions[i].text.toString());
      }
      axios.post('https://api.jotform.com/form?apiKey=' + apiKey, formData)
      .then(function(response){
        let newID = response.data.content.id;
        if(newID === undefined) {
          let garbageFormID = response.data.content.split(" ")[1];
          axios.delete("https://api.jotform.com/form/" + garbageFormID + "?apiKey=" + apiKey)
          .then(() => {
            resolve("-1");
          });
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

  const addQuestion = (question) => {
    return new Promise((resolve, reject) => {
      let formData = new FormData();
      formData.append('question[type]', 'control_textbox');
      formData.append('question[name]', question.qid);
      formData.append('question[text]', question.text);
      formData.append('question[order]', '0');
      axios.post('https://api.jotform.com/form/' + widgetDatabaseFormID + '/questions?apiKey=' + apiKey, formData)
      .then((response) => {
        resolve(1);
      });
    });
  }

  const checkDatabaseQuestions = async() => {
    let oldQuestions = widgetDatabaseQuestions;
    let newQuestions = getSavedQuestions();
    let oldQIDs = [];
    for(let i in oldQuestions) {
      oldQIDs.push(oldQuestions[i].name);
    }
    for(let i in newQuestions) {
      if(!oldQIDs.includes(newQuestions[i].qid)) {
        await addQuestion(newQuestions[i]);
      }
    }
    widgetDatabaseQuestions = await getQuestions(widgetDatabaseFormID);
  }
  //-----------------------------------------------------------------------------------------------------------

  //------------------------------------------FORM FUNCTIONS------------------------------------------------------------------
  const getSubmissions = async (formID) => {
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

  const getQuestions = async (formID) => {
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
    let QIDSetting = jotform.getWidgetSetting("Question IDs:");
    if(QIDSetting !== "") {
      let qids = QIDSetting.split(",");
      for(let i in widgetQuestions) {
        if(qids.includes(widgetQuestions[i].qid)) {
          toReturn.push(widgetQuestions[i]);
        }
      }
    }
    else {
      for(let i in widgetQuestions) {
        if(basicElementTypes.includes(widgetQuestions[i].type))
          toReturn.push(widgetQuestions[i]);
      }
    }
    return toReturn;
  }

  const setFieldsValue = () => {
    let arr = [];
    let questions = getSavedQuestions();
    let qids = [];
    for(let i in questions) {
      qids.push(questions[i].qid);
    }
    for(let i in recognizedProfile) {
      if(i === 1) {   //it is face descriptor
        continue;
      }
      else if(!qids.includes(recognizedProfile[i].name)) {
        continue;
      }
      let id = recognizedProfile[i].name;
      let value = (recognizedProfile[i].prettyFormat !== undefined) ? recognizedProfile[i].prettyFormat : recognizedProfile[i].answer;
      if(value === undefined) {
        value = "";
      }
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
    let formData = new FormData();
    for(let i in widgetDatabaseQuestions) {
      for(let j in values) {
        if(widgetDatabaseQuestions[i].name == values[j].selector) {
          formData.append("submission[" + widgetDatabaseQuestions[i].qid + "]", values[j].value);
        }
      }
    }
    formData.append("submission[1]", face.toString());  //face description is always the first question

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
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      })
      .catch(err => {
        //console.log("Open Camera Err:", err);
        setIsCameraEnabled(false);
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
  const init = async () => {
    if(!widgetLoaded) {
      jotform.subscribe("ready", async (response) => {
        if(jotform.isWidgetOnBuilder()) {
          setWidgetLoaded(true);
        }
        else {
          //WIDGET FORM ID
          widgetFormID = response.formID;

          //QUESTIONS OF WIDGET FORM
          widgetQuestions = await getQuestions(widgetFormID);
          console.log("Widget Questions:", widgetQuestions);

          //DATABASE FORM ID
          widgetDatabaseFormID = await getWidgetDatabaseFormID();
          console.log("database id:", widgetDatabaseFormID);
              
          //DATABASE QUESTIONS
          widgetDatabaseQuestions = await getQuestions(widgetDatabaseFormID);
          await checkDatabaseQuestions();

          //DATABSE SUBMISSIONS
          databaseSubmissions = await getSubmissions(widgetDatabaseFormID);

          //LOAD FACE API MODELS
          await loadModels();
          setWidgetLoaded(true);
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
    //Not recognized!
    if(isRecognized === false){
      jotform.subscribe("submit", basicCallbackFunction);
      return(
        <label style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
          <input type="checkbox" onClick={changeSavedStatus}/>
          Remember me later!
        </label>
      );
    }
    //Recognized!
    else{
      jotform.subscribe("submit", recognizedCallbackFunction);
      console.log("Recognized profile:", recognizedProfile);
      return(
        <div>
          <h3>Welcome Back!</h3>
          <button onClick={setFieldsValue}>Fill The Form</button>
        </div>
      );
    }
  }

  const returnBuilderValue = () => {
    let QIDSetting = jotform.getWidgetSetting("Question IDs:");
    return(
      <div>
        <h1>I am not working on builder BUT,</h1>
        <h3>You are saving the following questions:</h3>
        <p>{QIDSetting}</p>
      </div>
    );
  }

  const returnVideoElement = () => {
    return(
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
        <video ref={videoRef} height={videoHeight} width={videoWidth} onPlay={handleVideoOnPlay} style={{ borderRadius: '10px' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </div>
    );
  }

  const returnCameraDisallow = () => {
    console.log("returned!");
    return (
      <div>
        <img src={cameraDisabledImage} style={{ width: videoWidth, height: videoHeight, borderRadius: '10px'}}></img>
        <p>Please give the camera permission and refresh the page to use Face Recognition Widget!</p>
      </div>
    );
  }

  const returnLoading = () => {
    return(
      <div>
        <h2>Face Recignition Widget</h2>
        <p>Please make sure that camera captures you only.</p>
        <p>Try to stay stable.</p>
      </div>
    );
  }

  const returnStartScan = () => {
    return(
      <Wrapper>
        {returnLoading}
        <button onClick={setIsScanStarted(true)}>Start Scan</button>
      </Wrapper>
    );
  }

  const returnAfterStartScan = () => {
    return(
      <Wrapper>
        {
          isCameraEnabled === false ?
            returnCameraDisallow()
            :
            returnVideoElement()
        }
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
    );
  }

  const returnFunction = () => {
    //If widget is on the builder
    if(jotform.isWidgetOnBuilder()) {
      return returnBuilderValue();
    }
    //If the widget is loading
    if(!widgetLoaded) {
      return(
        <div>
          <h2>Face Recignition Widget</h2>
          <p>Please make sure that camera captures you only.</p>
          <p>Try to stay stable.</p>
        </div>
      );
    }
    if(recognizedProfile === null && isRecognized === null) {
      return(
        <Wrapper>
          <div>
            {returnVideoElement()}
          </div>
          {
            !captureVideo ?
            startVideo()
            :
            <></>
          }
        </Wrapper>
      );
    }
    else {
      return(
        <div>
          {
            !isRecognized ?
              returnVideoElement()
            :
              <></>
          }
          {returnFaceInfo()}
        </div>
      );
      //return returnFaceInfo();
    }
  }

  init();

  return (
    <Wrapper>
        {jotform.isWidgetOnBuilder() ?
          returnBuilderValue()
          :
          widgetLoaded ?
            isScanStarted ?
              returnAfterStartScan()
              :
              returnStartScan()
            :
            returnLoading()
        }
    </Wrapper>
  );
}

export default Video;