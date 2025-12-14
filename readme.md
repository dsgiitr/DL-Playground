# DL-Playground: Visual Neural Network Editor 
A React-based visual editor for designing and prototyping Pytorch neural network architectures. This tool allows users to drag-and-drop layers, configure parameters via a dynamic UI, and instantly generate the corresponding Python code. 

## Features
- **Visual Graph Editor**: Build on top of React Flow, enabling intuitive drag-and-drop construction of architectures.
- **Instant Code Generation**: Compiles the visual graph into a valid, copy-pasteable PyTorch `nn.Module` class, including `__init__` and `forward` methods.
- **Shape Inference**: Calculates and displays tensor shapes in real-time as you configure layers

## Future Additions
- **Custom Modules**: User defined modules that can be arbitrarily placed to create more modular and expressive architectures
- **Advanced Branching Logic**: Repeated Layers, If conditions and more. 
- **Improved Pytorch Support**: A massive library of standard PyTorch functionality. 

## Installation
1. Clone the repository.
2. Install dependencies:
```
npm install
# or 
yarn install
```

3. Start the development server
```
npm run dev 
```

This project is a combined effort from DSG club and SDSLabs at IITRoorkee. 
