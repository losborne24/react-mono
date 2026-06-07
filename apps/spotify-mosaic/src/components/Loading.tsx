import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

// Centred spinner used while a view's data loads.
const Loading = () => (
  <Box
    sx={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
    }}
  >
    <CircularProgress />
  </Box>
);
export default Loading;
