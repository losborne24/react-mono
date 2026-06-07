import Button from '@mui/material/Button';
import { useNavigate } from 'react-router-dom';
import * as constants from '@org/spotify-api';
import { useSession } from '@org/session';

const SelectImage = () => {
  const navigate = useNavigate();
  const { setImageSrc } = useSession();

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setImageSrc(reader.result as string);
        navigate(constants.create_mosaic_url);
      };
    }
  };
  return (
    <Button variant="contained" color="primary" component="label">
      Select Image
      <input hidden onChange={onFileUpload} type="file" accept="image/*" />
    </Button>
  );
};
export default SelectImage;
