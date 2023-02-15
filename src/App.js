import Video from './components/Video';

let formID = '230253108680045';
let apiKey = '773509ca899decb51f9308626699cf5f';

function App() {
  
  return(
    <Video apiKey={apiKey} formID={formID}/>
  );
}

export default App;