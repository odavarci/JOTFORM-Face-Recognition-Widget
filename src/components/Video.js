import axios from 'axios';
import * as faceapi from 'face-api.js';
import React, { useEffect } from 'react';
import Wrapper from './Helper/Wrapper';

let formDatabaseID = '230581075716052'; //Form that I store the match for forms and database forms
let widgetFormID; //Form that user interacts right now
let widgetDatabaseFormID; //Form that stores the database
let widgetQuestions, widgetDatabaseQuestions;

let jotform, jotformAPI; //Objects for managing jotform stuff
let faceArchiveSubmissions; //Stores the submissions in the database
const basicElementTypes = ['control_fullname', 'control_email', 'control_address', 'control_phone']; //I will store those types of fields

const basicID = '230572712727052';

function Video(props) {

  let formID = props.formID;
  let apiKey = props.apiKey;
  let faceRecognizorThreshold = 0.20;

  jotformAPI = window.JF;
  jotform = window.JFCustomWidget;

  const [modelsLoaded, setModelsLoaded] = React.useState(false);
  const [captureVideo, setCaptureVideo] = React.useState(false);
  const [capturedFace, setCapturedFace] = React.useState(null);
  const [recognizedProfile, setRecognizedProfile] = React.useState(null);
  const [widgetLoaded, setWidgetLoaded] = React.useState(false);
  const [isRecognized, setIsRecognized] = React.useState(null);

  //Video properties
  const videoRef = React.useRef();
  const videoHeight = 480;
  const videoWidth = 640;
  const canvasRef = React.useRef();
  
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = process.env.PUBLIC_URL + '/models';

      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ])
      .then(setModelsLoaded(true));
    }
    loadModels();
  }, []);

  const getSubmissions = (id) => {
    return new Promise(function(resolve, reject){
        axios.get('https://api.jotform.com/form/' + id + '/submissions?apiKey=' + apiKey)
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
        for (let i = 0; i < widgetQuestions.length; i++) {
          let formData = new FormData();
          formData.append('question[type]', widgetQuestions[i].type.toString());
          axios.post('https://api.jotform.com/form/' + databaseID + '/questions?apiKey=' + apiKey, formData)
          .then(function() {
          });
        }
        resolve(1);
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

  // const submitFace = (face, name, surname) => {
  //   let formData = new FormData();
  //   formData.append('submission[3]', face);
  //   formData.append('submission[6_first]', name);
  //   formData.append('submission[6_last]', surname);

  //   axios.post('https://api.jotform.com/form/' + formID + '/submissions?apiKey=' + apiKey, formData)
  //   .then(function(response){
  //     console.log("Submit response", response);
  //   })
  //   .catch(function(error){
  //     console.log(error);
  //   });
  // }

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


  const calculateSimilarityOfFaces = (face1, face2) => {
    let distance = 0;
    for(let i = 0; i < face1.length; i++){
      distance += Math.pow((face1[i] - face2[i]), 2)
    }
    return distance;
  }

  const findFace = (face) => {
    let isMatched = false;

    for(let i = 0; i < faceArchiveSubmissions.length; i++) {
      let currentFace = faceArchiveSubmissions[i].answers[3].answer.split(",");
      let distance = calculateSimilarityOfFaces(face, currentFace);
      if(distance < faceRecognizorThreshold) {
        let name = faceArchiveSubmissions[i].answers[6].answer.first;
        let surname = faceArchiveSubmissions[i].answers[6].answer.last;
        isMatched = true;
        setRecognizedProfile([name, surname]);
        return true;
      }
    }
    if(!isMatched) {
      return false;
    }
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
      arr.push(widgetQuestions.qid);
    }
    jotform.getFieldsValueById( arr, (response) => {
        // let input = response.data[0].value.split(" ");
        // submitFace(capturedFace, input[0], input[1]);
        // console.log("Submission sent");
        console.log(response);
      });
  }

  const returnFaceInfo = () => {
    if(isRecognized === false){
      return(
        <Wrapper>
          <p>Face not found. Please fill the form.</p>
          <button onClick={creteNewFaceSubmission}>Done!</button>
        </Wrapper>
      );  
    }
    else{
      setFieldsValue();
      return (
        <p>{recognizedProfile[0] + " " + recognizedProfile[1]}</p>
      );
    }
  }

  //Initilization
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
            faceArchiveSubmissions = response;
            setWidgetLoaded(true);
          });
        });
      });
    });
  }
  else {
    console.log("form id:", widgetFormID);
    console.log("form questions:", widgetQuestions);
    console.log("database id:", widgetDatabaseFormID);
    console.log("database submission:", faceArchiveSubmissions);
  }

  // return (
  //   <Wrapper>
  //       {widgetLoaded ?
  //           <Wrapper>
  //           {
  //             (recognizedProfile === null && isRecognized === null) ? 
  //               <div>
  //                 <div>
  //                   {
  //                     !captureVideo && modelsLoaded ?
  //                       startVideo()
  //                       :
  //                       <></>
  //                   }
  //                 </div>
  //                 {
  //                   captureVideo ?
  //                     modelsLoaded ?
  //                       <div>
  //                         <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
  //                           <video ref={videoRef} height={videoHeight} width={videoWidth} onPlay={handleVideoOnPlay} style={{ borderRadius: '10px' }} />
  //                           <canvas ref={canvasRef} style={{ position: 'absolute' }} />
  //                         </div>
  //                       </div>
  //                       :
  //                       <div>loading...</div>
  //                     :
  //                     <>
  //                     </>
  //                 }
  //               </div>
  //               :
  //               returnFaceInfo()
  //           }
  //         </Wrapper>
  //         :
  //         <h2>Widget Loading...</h2>
  //       }
  //   </Wrapper>
  // );

  return(
    <Wrapper>
      <h1>Hello World!</h1>
    </Wrapper>
  );

}

export default Video;