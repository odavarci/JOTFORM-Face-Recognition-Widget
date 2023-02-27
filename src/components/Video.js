import axios from 'axios';
import * as faceapi from 'face-api.js';
import React, { useEffect } from 'react';
import Wrapper from './Helper/Wrapper';

let jotform;
let faceArchiveSubmissions;

function Video(props) {

  let formID = props.formID;
  let apiKey = props.apiKey;
  let faceRecognizorThreshold = 0.20;

  const [modelsLoaded, setModelsLoaded] = React.useState(false);
  const [captureVideo, setCaptureVideo] = React.useState(false);
  const [capturedFace, setCapturedFace] = React.useState(null);
  const [recognizedProfile, setRecognizedProfile] = React.useState(null);
  const [widgetLoaded, setWidgetLoaded] = React.useState(false);
  const [isRecognized, setIsRecognized] = React.useState(null);

  const videoRef = React.useRef();
  const videoHeight = 480;
  const videoWidth = 640;
  const canvasRef = React.useRef();

  jotform = window.JFCustomWidget;
  jotform.subscribe("ready", () => {
    let submissions = getResponses();
    submissions.then(function(response){
      faceArchiveSubmissions = response;
      setWidgetLoaded(true);  
    });
  });

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
            console.log("IF STATEMENT WORKED!");
            closeWebcam();
            clearInterval(videoInterval);
            //setCapturedFace(detection.descriptor);
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

  const getResponses = () => {
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
  
  const logResponses = () => {
    let result = getResponses();
    result.then(function(response){
      console.log(response);
    });
  }

  const getQID = () => {
    axios.get('https://api.jotform.com/form/' + formID + '/questions?apiKey=' + apiKey)
    .then(function(response){
      console.log(response);
    })
  }

  const submitFace = (face, name, surname) => {
    let formData = new FormData();
    formData.append('submission[3]', face);
    formData.append('submission[6_first]', name);
    formData.append('submission[6_last]', surname);

    axios.post('https://api.jotform.com/form/' + formID + '/submissions?apiKey=' + apiKey, formData)
    .then(function(response){
      console.log("Submit response", response);
    })
    .catch(function(error){
      console.log(error);
    })
  }

  const calculateSimilarityOfFaces = (face1, face2) => {
    let distance = 0;
    for(let i = 0; i < face1.length; i++){
      distance += Math.pow((face1[i] - face2[i]), 2)
    }
    return distance;
  }

  // const findFace = () => {
  //   let submissions = getResponses();
  //   submissions.then(function(response){
  //     let isMatched = false;

  //     for(let i = 0; i < response.length; i++) {
  //       let face = response[i].answers[3].answer.split(",");
  //       let distance = calculateSimilarityOfFaces(face, capturedFace);
  //       console.log(response[i].answers[6].answer.first);
  //       console.log("Distance:", distance);
  //       if(distance < faceRecognizorThreshold) {
  //         let name = response[i].answers[6].answer.first;
  //         let surname = response[i].answers[6].answer.last;
  //         isMatched = true;
  //         setRecognizedProfile([name, surname]);
  //         break;
  //       }
  //     }
  //     if(!isMatched) {
  //       setIsRecognized(false);
  //     }
  //   });
  // }

  // const findFace = (face) => {
  //   let submissions = getResponses();
  //   submissions.then(function(response){

  //     let isMatched = false;

  //     for(let i = 0; i < response.length; i++) {
  //       let currentFace = response[i].answers[3].answer.split(",");
  //       let distance = calculateSimilarityOfFaces(face, currentFace);
  //       if(distance < faceRecognizorThreshold) {
  //         let name = response[i].answers[6].answer.first;
  //         let surname = response[i].answers[6].answer.last;
  //         isMatched = true;
  //         setRecognizedProfile([name, surname]);
  //         return true;
  //       }
  //     }
  //     if(!isMatched) {
  //       return false;
  //     }
  //   });
  // }

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
    jotform.getFieldsValueById( ['3'], (response) => {
        let input = response.data[0].value.split(" ");
        submitFace(capturedFace, input[0], input[1]);
        console.log("Submission sent");
    });
  }

  // const returnFaceInfo = () => {
  //   if(recognizedProfile === null){
  //     if(isRecognized === null){
  //       findFace();
  //     }
  //     else{
  //       return(
  //         <Wrapper>
  //           <p>Face not found. Please fill the form.</p>
  //           <button onClick={creteNewFaceSubmission}>Done!</button>
  //         </Wrapper>
  //       );  
  //     }
  //   }
  //   else{
  //     jotform.setFrameSize(
  //       {width:0,
  //       length:0
  //       });
  //     setFieldsValue();
  //     return (
  //       <p>{recognizedProfile[0] + " " + recognizedProfile[1]}</p>
  //     );
  //   }
  // }

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

  // return (
  //   <Wrapper>
  //       {widgetLoaded ?
  //           <Wrapper>
  //           {
  //             (capturedFace === null) ? 
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

  return (
    <Wrapper>
        {widgetLoaded ?
            <Wrapper>
            {
              (recognizedProfile === null && isRecognized === null) ? 
                <div>
                  <div>
                    {
                      !captureVideo && modelsLoaded ?
                        startVideo()
                        :
                        <></>
                    }
                  </div>
                  {
                    captureVideo ?
                      modelsLoaded ?
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                            <video ref={videoRef} height={videoHeight} width={videoWidth} onPlay={handleVideoOnPlay} style={{ borderRadius: '10px' }} />
                            <canvas ref={canvasRef} style={{ position: 'absolute' }} />
                          </div>
                        </div>
                        :
                        <div>loading...</div>
                      :
                      <>
                      </>
                  }
                </div>
                :
                returnFaceInfo()
            }
          </Wrapper>
          :
          <h2>Widget Loading...</h2>
        }
    </Wrapper>
  );
}

export default Video;