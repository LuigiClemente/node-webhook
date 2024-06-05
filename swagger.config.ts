import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'My TypeScript API',
    version: '1.0.0',
    description: 'A sample API with Swagger documentation',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./src/*.ts', 'server.ts'], // files containing annotations as above
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
