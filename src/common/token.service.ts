import { JwtService } from '@nestjs/jwt';
import { User } from '../models/user.model';

export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  createToken(user: User) {
    const payload = { username: user.username, sub: user.id };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
